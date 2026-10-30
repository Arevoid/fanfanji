/** Original-text locations are separate from generated chapter/branch progress. */
export interface ReadingSourceCursor {
  bookId: string;
  contentHash: string;
  chapterId: string;
  paragraphAnchorId: string;
  characterOffset: number;
}
export interface ReadingSourceUpdate {
  nodeId: string;
  eventLabel: string;
  evidenceQuote: string;
  progress: "stay" | "advance" | "deviate";
  reason: string;
  summary: string;
}
export interface ReadingSourceContinuity {
  cursor: ReadingSourceCursor;
  mode: "following" | "diverged";
  summary: string;
  handledNodeIds?: string[];
  changes: Array<{ nodeId: string; eventLabel: string; reason: string }>;
}
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function normalizeReadingSourceCursor(value: unknown): ReadingSourceCursor | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const item = value as Record<string, unknown>;
  const bookId = text(item.bookId, 200), contentHash = text(item.contentHash, 200), chapterId = text(item.chapterId, 200), paragraphAnchorId = text(item.paragraphAnchorId, 200);
  if (!bookId || !contentHash || !chapterId || !paragraphAnchorId) return;
  return { bookId, contentHash, chapterId, paragraphAnchorId, characterOffset: Math.max(0, Math.floor(Number(item.characterOffset) || 0)) };
}
export function normalizeReadingSourceContinuity(value: unknown): ReadingSourceContinuity | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const item = value as Record<string, unknown>;
  const cursor = normalizeReadingSourceCursor(item.cursor);
  if (!cursor) return;
  const changes = Array.isArray(item.changes) ? item.changes.flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];
    return [{ nodeId: text(entry.nodeId, 500), eventLabel: text(entry.eventLabel, 200), reason: text(entry.reason, 500) }];
  }).filter(entry => entry.nodeId && entry.reason).slice(-24) : [];
  return { cursor, mode: item.mode === "diverged" ? "diverged" : "following", summary: text(item.summary, 2800), handledNodeIds: Array.isArray(item.handledNodeIds) ? Array.from(new Set(item.handledNodeIds.filter((id): id is string => typeof id === "string" && id.length <= 500))).slice(-512) : [], changes };
}
export function normalizeReadingSourceUpdate(value: unknown): ReadingSourceUpdate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const item = value as Record<string, unknown>;
  if (!["stay", "advance", "deviate"].includes(String(item.progress))) return;
  return { nodeId: text(item.nodeId, 500), eventLabel: text(item.eventLabel, 200), evidenceQuote: text(item.evidenceQuote, 300), progress: item.progress as ReadingSourceUpdate["progress"], reason: text(item.reason, 500), summary: text(item.summary, 2800) };
}
