import type { Character, MemoryItem } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { migrateLegacyCharacterKnowledge } from "./legacyCharacterKnowledgeMigration";
import { loadKnowledgeClaims, appendMany, saveKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { evolveKnowledgeClaims } from "../../../domain/characterKnowledge/knowledgeEvolution";
import { conversationSummaryRepository } from "../../../core/storage/repositories/conversationSummaryRepository";
import { behaviorCorrectionRepository } from "../../../core/storage/repositories/behaviorCorrectionRepository";
import { loadMemories, saveMemories } from "../../../core/storage/repositories/memoryRepository";
import { readJson, writeJson } from "../../../core/storage/storageAdapter";
import { replaceMemoryStores } from "../../../core/storage/memoryStoreTransaction";
import { storageKeys } from "../../../core/storage/storageKeys";
import { loadCharacterContinuity } from "../../../core/storage/repositories/characterContinuityRepository";
import { isForgottenKnowledge } from "../../../domain/memory/characterContinuity";
import { sourceRevision } from "../../../domain/characterKnowledge/knowledgeEvolution";
import {readMemorySystem} from "../../../core/storage/repositories/memorySystemRepository";

const KEY = "phone_memory_continuity_migration_v1";
const SNAPSHOT_KEY = "phone_memory_continuity_legacy_snapshot_v1";
interface Snapshot { version: 1; characters: Character[]; relationships: CharacterRelationship[]; memories: MemoryItem[]; claims?: KnowledgeClaim[]; memoryHistory?: MemoryItem[] }
export interface MemoryMigrationProgress { version: 1; status: "running" | "failed" | "needs_review" | "completed";
  completed: number; total: number; orphanIds: string[]; consentAt: number }
let running = false;
/** Prepare a previous-client-compatible memory store without rolling back new
 * facts or resurrecting withdrawn/edited/forgotten source text. */
export function restoreLegacyMemoryCompatibility() {
  const snapshot = readJson<Snapshot | undefined>(SNAPSHOT_KEY, undefined);
  const current = loadMemories([]), claims = loadKnowledgeClaims(), continuity = loadCharacterContinuity();
  if (running || !snapshot.valid || !snapshot.value || !Array.isArray(snapshot.value.memories)
    || !current.valid || !claims.valid || !continuity.valid) return { success: false, restored: 0, skipped: 0 };
  const additions: MemoryItem[] = []; let skipped = 0;
  for (const memory of snapshot.value.memories) {
    if (current.value.some(item => item.id === memory.id)) continue; // latest edit always wins
    const linked = claims.value.filter(claim => claim.source.sourceRecordId === memory.id && claim.characterId === memory.characterId
      && (!memory.relationId || claim.relationId === memory.relationId));
    // A split card may contain a withdrawn fragment. Do not reconstruct the
    // whole card from surviving fragments or guess a new legacy summary.
    if (linked.length !== 1 || linked[0].organizationOriginal || linked[0].organizationSourceId
      || linked[0].statement.trim() !== memory.content.trim() || linked[0].status !== "active" || linked[0].supersededById
      || linked[0].recallDisabled || isForgottenKnowledge(linked[0], continuity.value.forgotten)) { skipped++; continue; }
    additions.push({ ...memory, relationId: linked[0].relationId, userIdentityId: linked[0].userIdentityId,
      conversationId: linked[0].conversationId, sourceKnowledgeClaimIds: [linked[0].id] });
  }
  const write = replaceMemoryStores({ [storageKeys.memoryVaultItems]: [...current.value, ...additions] });
  return { ...write, restored: write.success ? additions.length : 0, skipped };
}
export const getMemoryMigrationProgress = () => {
  const read = readJson<MemoryMigrationProgress | undefined>(KEY, undefined);
  if (!read.found) return read;
  const value = read.value;
  const valid = read.valid && Boolean(value && value.version === 1
    && ["running", "failed", "needs_review", "completed"].includes(value.status)
    && Number.isInteger(value.completed) && Number.isInteger(value.total) && value.completed >= 0 && value.completed <= value.total
    && Number.isFinite(value.consentAt) && value.consentAt > 0 && Array.isArray(value.orphanIds) && value.orphanIds.every((id) => typeof id === "string"));
  return { ...read, valid, ...(valid ? {} : { error: "validation" as const }) };
};
export function needsMemoryContinuityMigration(memories: readonly MemoryItem[], characters: readonly Character[] = []) {
  const system=readMemorySystem();
  if(system.found&&system.valid)return !system.value.migrationFinished&&system.value.choice==="pending"&&system.value.hasLegacy;
  const progress = getMemoryMigrationProgress();
  const claims = loadKnowledgeClaims().value;
  const modernIds = new Set(claims.filter((claim) => claim.continuityVersion === 1).flatMap((claim) => [claim.id, ...(claim.mergedClaimIds || [])]));
  const hasLegacyMemory = memories.some((memory) => !memory.sourceKnowledgeClaimIds?.length
    || !memory.sourceKnowledgeClaimIds.every((id) => modernIds.has(id)));
  return (hasLegacyMemory || claims.some((claim) => claim.continuityVersion !== 1)
    || characters.some((character) => character.compressedMemory?.trim())) && progress.value?.status !== "completed";
}
/** Consent is persisted once. Every bounded batch is idempotent; original data survives failures. */
export async function migrateMemoryContinuity(input: { characters: Character[]; relationships: CharacterRelationship[];
  consent: boolean; onProgress?: (progress: MemoryMigrationProgress) => void }) {
  if (running) return undefined;
  const read = getMemoryMigrationProgress();
  if (!read.valid || (!input.consent && !read.value?.consentAt)) return undefined;
  const old = loadMemories([]);
  if (!old.valid) return undefined;
  let snapshot = readJson<Snapshot | undefined>(SNAPSHOT_KEY, undefined);
  if (!snapshot.valid) return undefined;
  if (!snapshot.found) {
    const claims = loadKnowledgeClaims();
    if (!claims.valid) return undefined;
    // Archive only migration inputs; avatars and media remain in their original stores.
    const value: Snapshot = { version: 1, characters: input.characters.map((character) => ({
      id: character.id, compressedMemory: character.compressedMemory, lastActiveTime: character.lastActiveTime,
    } as Character)), relationships: input.relationships, memories: old.value, claims: claims.value.filter(c=>c.legacyCompatible||c.organizationOriginal||["legacy_memory","import"].includes(c.source.kind)) };
    if (!writeJson(SNAPSHOT_KEY, value).success) return undefined;
    snapshot = readJson(SNAPSHOT_KEY, value);
  }
  if (!snapshot.value || snapshot.value.version !== 1 || !Array.isArray(snapshot.value.memories)
    || !Array.isArray(snapshot.value.characters) || !Array.isArray(snapshot.value.relationships)) return undefined;
  const source = snapshot.value;
  let progress: MemoryMigrationProgress = read.value || { version: 1, status: "running", completed: 0,
    total: source.memories.length + source.characters.filter((character) => character.compressedMemory?.trim()).length + (source.claims?.length || 0),
    orphanIds: [], consentAt: Date.now() };
  if (progress.status === "completed") return progress;
  running = true;
  const publish = (next: MemoryMigrationProgress) => {
    if (!writeJson(KEY, next).success) throw new Error("migration_progress_write_failed");
    progress = next; input.onProgress?.(next);
  };
  try {
    publish({ ...progress, status: "running" });
    // Needs-review runs re-evaluate preserved originals against current explicit relationships.
    let start = read.value?.status === "needs_review" ? 0 : progress.completed;
    for (; start < source.memories.length; start += 25) {
      const records = source.memories.slice(start, start + 25);
      const existing=loadKnowledgeClaims().value;
      const migration = migrateLegacyCharacterKnowledge({ characters: [], relationships: input.relationships,
        memories: records, now: Date.now(), existingClaims: existing.filter(claim=>!records.some(record=>record.id===claim.source.sourceRecordId&&record.characterId===claim.characterId&&(!record.relationId||record.relationId===claim.relationId)&&record.content.trim()!==claim.statement.trim())) });
      migration.claims=migration.claims.map(claim=>existing.some(old=>old.id===claim.id&&old.statement!==claim.statement)?{...claim,id:`${claim.id}:revision:${sourceRevision(claim.statement)}`,source:{...claim.source,evidenceKey:`${claim.source.evidenceKey}:${sourceRevision(claim.statement)}`}}:claim);
      if (!appendMany(migration.claims).success
        || !conversationSummaryRepository.appendMany(migration.summaries).success
        || migration.corrections.some((record) => !behaviorCorrectionRepository.append(record).success)) throw new Error("migration_target_write_failed");
      const evaluated = new Set(records.map((record) => `memory:${record.id}`));
      publish({ ...progress, completed: Math.min(start + records.length, source.memories.length),
        orphanIds: [...progress.orphanIds.filter((id) => !evaluated.has(id)), ...migration.orphanRecordIds] });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const summaries = migrateLegacyCharacterKnowledge({ characters: source.characters,
      relationships: input.relationships, memories: [], now: Date.now() });
    if (!conversationSummaryRepository.appendMany(summaries.summaries).success) throw new Error("migration_summary_write_failed");
    const orphans = new Set([...progress.orphanIds, ...summaries.orphanRecordIds]);
    // Existing Truth users need the same one-time upgrade. Re-read live records,
    // preserve source snapshots, and never resurrect records deleted mid-flight.
    const liveClaims = loadKnowledgeClaims();
    if (!liveClaims.valid || !saveKnowledgeClaims(evolveKnowledgeClaims([], [...liveClaims.value]
      .sort((a, b) => (a.occurredAt ?? a.recordedAt) - (b.occurredAt ?? b.recordedAt))).map((claim) => ({ ...claim, continuityVersion: 1 }))).success) throw new Error("migration_claim_upgrade_failed");
    // Re-read at cutover: edits and additions made while batches yielded must survive.
    const latest = loadMemories([]);
    if (!latest.valid) throw new Error("migration_legacy_read_failed");
    const deleted=source.memories.filter(item=>!latest.value.some(memory=>memory.id===item.id&&memory.characterId===item.characterId&&memory.relationId===item.relationId));
    const retained = latest.value.filter((memory) => orphans.has(`memory:${memory.id}`)
      || !source.memories.some((item) => item.id === memory.id && item.relationId === memory.relationId && item.content === memory.content));
    const changed = retained.filter(memory=>!source.memories.some(item=>item.id===memory.id&&item.characterId===memory.characterId&&item.relationId===memory.relationId&&item.content===memory.content));
    if (changed.length||deleted.length) {
      const affected=(claim:KnowledgeClaim)=>[...changed,...deleted].some(memory=>memory.id===claim.source.sourceRecordId&&memory.characterId===claim.characterId&&(!memory.relationId||memory.relationId===claim.relationId)&&(deleted.includes(memory)||memory.content.trim()!==claim.statement.trim()));
      const replaced=[...changed,...deleted];
      const nextSource={...source,memoryHistory:[...(source.memoryHistory||[]),...source.memories.filter(item=>replaced.some(memory=>memory.id===item.id&&memory.characterId===item.characterId&&memory.relationId===item.relationId))],
        memories:[...source.memories.filter(item=>!replaced.some(memory=>memory.id===item.id&&memory.characterId===item.characterId&&memory.relationId===item.relationId)),...changed]};
      const nextProgress={...progress,completed:0,orphanIds:progress.orphanIds.filter(id=>!deleted.some(memory=>id===`memory:${memory.id}`)),total:nextSource.memories.length+source.characters.filter(character=>character.compressedMemory?.trim()).length+(source.claims?.length||0),status:"running" as const};
      if(!replaceMemoryStores({[SNAPSHOT_KEY]:nextSource,[KEY]:nextProgress,[storageKeys.characterKnowledgeClaims]:loadKnowledgeClaims().value.map(claim=>affected(claim)?{...claim,status:"retracted",truthStatus:"retracted",retractionReason:"migration_source_changed"}:claim)}).success)throw new Error("migration_snapshot_extension_failed");
      running = false;
      return await migrateMemoryContinuity({ ...input, consent: false });
    }
    const finished={...progress,completed:progress.total,status:orphans.size||retained.length?"needs_review" as const:"completed" as const,orphanIds:[...orphans]};
    if(!replaceMemoryStores({[storageKeys.memoryVaultItems]:retained,[KEY]:finished}).success)throw new Error("migration_legacy_cutover_failed");
    progress=finished;input.onProgress?.(finished);
    return progress;
  } catch {
    const failed = { ...progress, status: "failed" as const };
    writeJson(KEY, failed); input.onProgress?.(failed);
    return failed;
  } finally { running = false; }
}
