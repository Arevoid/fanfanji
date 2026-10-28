import type { StorageErrorKind, StorageResult, StorageWriteResult } from "./storageTypes";
import { isMemoryContentKey, LEGACY_MEMORY_TRANSACTION_KEY, MEMORY_CONTENT_DB_NAME } from "./memoryContentKeys";

interface ContentRow { key: [string, string]; dataset: string; value: string; order: number; characterId?: string; relationId?: string; userIdentityId?: string; conversationId?: string }
interface Dataset { key: string; shape: "array" | "object" | "value"; fields?: Record<string, unknown>; arrays?: string[] }
type Phase = "disabled" | "loading" | "ready" | "failed";
export interface MemoryContentStatus { phase: Phase; pending: number; datasets: number; bytes: number; failure?: { key: string; error: StorageErrorKind; at: number }; legacyRemaining: number }
const RECORDS = "records", DATASETS = "datasets", META = "meta";
const errorKind = (error: unknown): StorageErrorKind => (error as { name?: string })?.name === "QuotaExceededError" ? "quota" : error instanceof SyntaxError ? "parse" : "write";
const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const complete = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error || new Error("transaction_aborted")); });
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

export function applyLegacyMemoryJournal(source: Map<string, string>, raw: string | null): void {
  if (!raw) return;
  const journal = JSON.parse(raw);
  if (journal?.version !== 1 || !["pending", "committed"].includes(journal.status) || !journal.before || typeof journal.before !== "object" || Array.isArray(journal.before)) throw new Error("Invalid legacy memory transaction");
  for (const [key, value] of Object.entries(journal.before)) {
    if (!isMemoryContentKey(key) || (value !== null && typeof value !== "string")) throw new Error("Invalid legacy memory transaction source");
    if (journal.status === "pending") { if (value === null) source.delete(key); else { JSON.parse(value as string); source.set(key, value as string); } }
  }
}

/** Split arrays into independently replaceable records. Never infer identity from a name. */
function encode(key: string, raw: string): { dataset: Dataset; rows: ContentRow[] } {
  const value: unknown = JSON.parse(raw);
  const rows: ContentRow[] = [];
  const array = (field: string, items: unknown[]) => {
    const occurrences = new Map<string, number>();
    items.forEach((item, order) => {
      const id = item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : `position:${order}`;
      const occurrence = occurrences.get(id) || 0; occurrences.set(id, occurrence + 1);
      const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const scope = source.scope && typeof source.scope === "object" ? source.scope as Record<string, unknown> : source;
      const ownership = Object.fromEntries(["characterId", "relationId", "userIdentityId", "conversationId"].filter(name => typeof scope[name] === "string").map(name => [name, scope[name]]));
      rows.push({ key: [key, JSON.stringify([field, id, occurrence])], dataset: key, order, value: JSON.stringify(item), ...ownership });
    });
  };
  if (Array.isArray(value)) { array("", value); return { dataset: { key, shape: "array" }, rows }; }
  if (value && typeof value === "object") {
    const fields: Record<string, unknown> = Object.create(null), arrays: string[] = [];
    for (const [field, item] of Object.entries(value)) {
      if (Array.isArray(item)) { arrays.push(field); array(field, item); } else fields[field] = item;
    }
    return { dataset: { key, shape: "object", fields, arrays }, rows };
  }
  return { dataset: { key, shape: "value", fields: { value } }, rows };
}
function decode(dataset: Dataset, rows: ContentRow[]): string {
  const array = (field: string) => rows.filter(row => JSON.parse(row.key[1])[0] === field).sort((a, b) => a.order - b.order).map(row => JSON.parse(row.value));
  if (dataset.shape === "array") return JSON.stringify(array(""));
  if (dataset.shape === "value") return JSON.stringify(dataset.fields?.value);
  const result: Record<string, unknown> = Object.assign(Object.create(null), dataset.fields);
  for (const field of dataset.arrays || []) result[field] = array(field);
  return JSON.stringify(result);
}

/** Synchronous reads are hydrated snapshots. Writes are explicitly pending until
 * flush() confirms the IndexedDB transaction. Failure invalidates the session. */
export class MemoryContentStore {
  private phase: Phase = "disabled";
  private db?: IDBDatabase;
  private cache = new Map<string, string>();
  private committed = new Map<string, string>();
  private pending = new Map<string, string | null>();
  private running?: Promise<StorageWriteResult>;
  private starting?: Promise<StorageWriteResult>;
  private failure?: MemoryContentStatus["failure"];
  private legacyRemaining = 0;
  private notify: (status: MemoryContentStatus) => void = () => {};
  private allowed = () => true;
  get active() { return this.phase !== "disabled"; }
  get status(): MemoryContentStatus { return { phase: this.phase, pending: this.pending.size + Number(Boolean(this.running)), datasets: this.cache.size,
    bytes: [...this.cache.values()].reduce((sum, raw) => sum + raw.length * 2, 0), failure: this.failure, legacyRemaining: this.legacyRemaining }; }
  read(key: string): StorageResult<string | null> {
    if (this.phase !== "ready") return { value: null, found: false, valid: false, error: "unavailable" };
    return { value: this.cache.get(key) ?? null, found: this.cache.has(key), valid: true };
  }
  stage(values: Readonly<Record<string, string | null>>): StorageWriteResult {
    if (this.phase !== "ready" || !this.allowed()) return { success: false, error: "unavailable" };
    try { for (const [key, raw] of Object.entries(values)) { if (!isMemoryContentKey(key)) return { success: false, error: "validation" }; if (raw !== null) JSON.parse(raw); } }
    catch { return { success: false, error: "parse" }; }
    for (const [key, raw] of Object.entries(values)) {
      if ((this.cache.get(key) ?? null) === raw) continue;
      if (raw === null) this.cache.delete(key); else this.cache.set(key, raw);
      this.pending.set(key, raw);
    }
    // Coalesce synchronous business mutations into one atomic transaction.
    queueMicrotask(() => { void this.flush(); });
    const pending = this.pending.size > 0 || Boolean(this.running);
    return pending ? { success: true, pending: true, durable: Promise.resolve().then(() => this.flush()) } : { success: true };
  }
  private fail(key: string, error: StorageErrorKind): StorageWriteResult {
    this.phase = "failed"; this.failure = { key, error, at: Date.now() };
    // Best-effort bounded diagnostics only; never duplicate source payloads.
    try { const tx = this.db?.transaction(META, "readwrite"); tx?.objectStore(META).put(this.failure, "lastFailure"); }
    catch { /* The visible failure remains available when storage itself is unavailable. */ }
    this.cache = new Map(this.committed); this.pending.clear(); this.notify(this.status);
    return { success: false, error };
  }
  async flush(): Promise<StorageWriteResult> {
    if (this.running) { const result = await this.running; return result.success ? this.flush() : result; }
    if (this.phase !== "ready" || !this.db) return { success: false, error: this.failure?.error || "unavailable" };
    if (!this.pending.size) return { success: true };
    if (!this.allowed()) return this.fail("writer", "verification");
    const batch = new Map(this.pending); this.pending.clear();
    this.running = (async () => {
      try {
        const tx = this.db!.transaction([RECORDS, DATASETS], "readwrite"), done = complete(tx);
        const records = tx.objectStore(RECORDS), datasets = tx.objectStore(DATASETS);
        for (const [key, raw] of batch) {
          const before = this.committed.get(key);
          const old = before === undefined ? undefined : encode(key, before);
          const next = raw === null ? undefined : encode(key, raw);
          const oldRows = new Map(old?.rows.map(row => [row.key[1], row]) || []);
          const nextRows = new Map(next?.rows.map(row => [row.key[1], row]) || []);
          for (const [id, row] of oldRows) if (!nextRows.has(id)) records.delete(row.key);
          for (const [id, row] of nextRows) { const previous = oldRows.get(id); if (!previous || previous.order !== row.order || previous.value !== row.value) records.put(row); }
          if (next) datasets.put(next.dataset); else datasets.delete(key);
        }
        await done;
        if (!this.allowed()) return this.fail("writer", "verification");
        for (const [key, raw] of batch) { if (raw === null) this.committed.delete(key); else this.committed.set(key, raw); }
        return { success: true };
      } catch (error) { return this.fail([...batch.keys()].join(","), errorKind(error)); }
    })();
    const result = await this.running; this.running = undefined;
    this.notify(this.status);
    return result.success && this.pending.size ? this.flush() : result;
  }
  initialize(input: { factory: IDBFactory; legacy: Storage; writable: boolean; canWrite?: () => boolean; onStatus?: (status: MemoryContentStatus) => void }): Promise<StorageWriteResult> {
    if (this.starting) return this.starting;
    this.phase = "loading"; this.allowed = input.canWrite || (() => input.writable); this.notify = input.onStatus || (() => {});
    this.starting = this.start(input);
    return this.starting;
  }
  private async copyMigration(source: Map<string, string>, oldRows: ContentRow[], oldDatasets: Dataset[]): Promise<void> {
    const keys = new Set([...source.keys(), ...oldDatasets.map(dataset => dataset.key), ...oldRows.map(row => row.dataset)]);
    for (const key of keys) {
      const raw = source.get(key), next = raw === undefined ? undefined : encode(key, raw);
      const previous = new Map(oldRows.filter(row => row.dataset === key).map(row => [row.key[1], row]));
      const incoming = new Map(next?.rows.map(row => [row.key[1], row]) || []);
      const deletes = [...previous].filter(([id]) => !incoming.has(id)).map(([, row]) => row.key);
      const puts = [...incoming].filter(([id, row]) => previous.get(id)?.value !== row.value || previous.get(id)?.order !== row.order).map(([, row]) => row);
      for (let offset = 0; offset < Math.max(deletes.length, puts.length); offset += 200) {
        if (!this.allowed()) throw new Error("Writer permission expired during migration");
        const tx = this.db!.transaction(RECORDS, "readwrite"), done = complete(tx), records = tx.objectStore(RECORDS);
        for (const id of deletes.slice(offset, offset + 200)) records.delete(id);
        for (const row of puts.slice(offset, offset + 200)) records.put(row);
        await done;
      }
      if (!this.allowed()) throw new Error("Writer permission expired during migration");
      const tx = this.db!.transaction(DATASETS, "readwrite"), done = complete(tx);
      if (next) tx.objectStore(DATASETS).put(next.dataset); else tx.objectStore(DATASETS).delete(key);
      await done;
    }
  }
  private async start(input: { factory: IDBFactory; legacy: Storage; writable: boolean }): Promise<StorageWriteResult> {
    try {
      const opening = input.factory.open(MEMORY_CONTENT_DB_NAME, 1);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        const records = db.createObjectStore(RECORDS, { keyPath: "key" });
        records.createIndex("dataset", "dataset");
        records.createIndex("owner", ["dataset", "userIdentityId", "characterId"]);
        records.createIndex("scope", ["dataset", "userIdentityId", "characterId", "relationId", "conversationId"]);
        db.createObjectStore(DATASETS, { keyPath: "key" }); db.createObjectStore(META);
      };
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        let expired = false;
        const timer = setTimeout(() => { expired = true; reject(new Error("Memory database opening timed out")); }, 5_000);
        opening.onsuccess = () => { clearTimeout(timer); if (expired) opening.result.close(); else resolve(opening.result); };
        opening.onerror = () => { clearTimeout(timer); reject(opening.error); };
        opening.onblocked = () => { clearTimeout(timer); expired = true; reject(new Error("Memory database upgrade blocked")); };
      });
      this.db.onversionchange = () => { this.db?.close(); this.fail("version", "verification"); };
      const tx = this.db.transaction([RECORDS, DATASETS, META], "readonly");
      const [datasets, rows, manifest, lastFailure] = await Promise.all([request(tx.objectStore(DATASETS).getAll()) as Promise<Dataset[]>, request(tx.objectStore(RECORDS).getAll()) as Promise<ContentRow[]>, request(tx.objectStore(META).get("active")), request(tx.objectStore(META).get("lastFailure"))]);
      if (lastFailure && typeof lastFailure.key === "string" && typeof lastFailure.error === "string" && Number.isFinite(lastFailure.at)) this.failure = { key: lastFailure.key, error: lastFailure.error, at: lastFailure.at };
      if (manifest && manifest.version !== 1 || datasets.some(dataset => !isMemoryContentKey(dataset.key) || !["array", "object", "value"].includes(dataset.shape))
        || rows.some(row => !Array.isArray(row.key) || row.key.length !== 2 || row.key[0] !== row.dataset || typeof row.value !== "string" || !Number.isInteger(row.order))) throw new Error("Memory database validation failed");
      for (const dataset of datasets) this.cache.set(dataset.key, decode(dataset, rows.filter(row => row.dataset === dataset.key)));
      this.committed = new Map(this.cache);
      if (!manifest) {
        const source = new Map<string, string>(), originals = new Map<string, string>();
        for (let i = 0; i < input.legacy.length; i++) { const key = input.legacy.key(i); if (key && isMemoryContentKey(key)) { const raw = input.legacy.getItem(key); if (raw !== null) { try { JSON.parse(raw); } catch { return this.fail(key, "parse"); } source.set(key, raw); } } }
        for (const [key, raw] of source) originals.set(key, raw);
        const journalRaw = input.legacy.getItem(LEGACY_MEMORY_TRANSACTION_KEY);
        try { applyLegacyMemoryJournal(source, journalRaw); } catch { return this.fail(LEGACY_MEMORY_TRANSACTION_KEY, "validation"); }
        // A readonly window may display a consistent legacy view, but never migrates.
        if (!input.writable) { this.cache = source; this.committed = new Map(source); this.phase = "ready"; return { success: true }; }
        await this.copyMigration(source, rows, datasets);
        // Read back every dataset before publishing the cutover marker.
        const verifyTx = this.db.transaction([RECORDS, DATASETS], "readonly");
        const [verifiedDatasets, verifiedRows] = await Promise.all([request(verifyTx.objectStore(DATASETS).getAll()) as Promise<Dataset[]>, request(verifyTx.objectStore(RECORDS).getAll()) as Promise<ContentRow[]>]);
        const verified = new Map(verifiedDatasets.map(dataset => [dataset.key, decode(dataset, verifiedRows.filter(row => row.dataset === dataset.key))]));
        for (const [key, raw] of source) if (!verified.has(key) || canonical(JSON.parse(verified.get(key)!)) !== canonical(JSON.parse(raw))) return this.fail(key, "verification");
        if ([...originals].some(([key, raw]) => input.legacy.getItem(key) !== raw) || input.legacy.getItem(LEGACY_MEMORY_TRANSACTION_KEY) !== journalRaw) return this.fail("legacy_changed", "verification");
        if (!this.allowed()) return this.fail("writer", "verification");
        const markerTx = this.db.transaction(META, "readwrite"), done = complete(markerTx);
        markerTx.objectStore(META).put({ version: 1, at: Date.now() }, "active"); await done;
        if (!this.allowed()) return this.fail("writer", "verification");
        this.cache = verified; this.committed = new Map(verified);
        // Cleanup never occurs before durable verification and cutover.
        try {
          for (const [key, raw] of originals) if (input.legacy.getItem(key) === raw) input.legacy.removeItem(key);
          if (input.legacy.getItem(LEGACY_MEMORY_TRANSACTION_KEY) === journalRaw) input.legacy.removeItem(LEGACY_MEMORY_TRANSACTION_KEY);
        } catch { /* Durable cutover succeeded. Keep an uncleared legacy copy visible in diagnostics. */ }
      }
      this.phase = "ready";
      this.legacyRemaining = Array.from({ length: input.legacy.length }, (_, i) => input.legacy.key(i)).filter(key => key && isMemoryContentKey(key)).length;
      this.notify(this.status); return { success: true };
    } catch (error) { return this.fail("initialization", errorKind(error)); }
  }
  exportSnapshot(): Record<string, string> { if (this.phase !== "ready") throw new Error("Memory storage not ready"); return Object.fromEntries(this.committed); }
  close() { this.db?.close(); }
}
export const memoryContentStore = new MemoryContentStore();
