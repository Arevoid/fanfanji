import type { CharacterTruthScope } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { evaluateKnowledgeWrite } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { isExactTruthScope, appendKnowledgeClaims } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { sourceRevision } from "../../../domain/characterKnowledge/knowledgeEvolution";
import { createConversationSummaryRecord } from "../../../domain/characterKnowledge/conversationSummaryProjection";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { loadCharacterContinuity } from "../../../core/storage/repositories/characterContinuityRepository";
import { isForgottenKnowledge } from "../../../domain/memory/characterContinuity";
import { replaceMemoryStores } from "../../../core/storage/memoryStoreTransaction";
import { storageKeys } from "../../../core/storage/storageKeys";
/** Explicit user archive: preserve an independent snapshot of real discussion, never assert a story as real life. */
export function archiveSharedMediaMemory(input: { scope: CharacterTruthScope; app: "reading" | "cinema"; recordId: string; title: string;
  messages: readonly { id: string; author: "user" | "character"; text: string; occurredAt: number; confirmationAction?: boolean }[]; now?: number }) {
  if (!input.recordId || !input.messages.length || !input.messages.some((message) => message.author === "user")
    || input.messages.some((message) => !message.id || !message.text.trim()
      || !Number.isFinite(message.occurredAt) || Math.abs(message.occurredAt) > 8.64e15)) return { success: false, error: "validation" as const };
  const now = input.now ?? Date.now(); const revision = sourceRevision(JSON.stringify(input.messages));
  const eventId = `${input.app}-experience:${input.recordId}`; const id = `${eventId}:${revision}`;
  const sourceIds = input.messages.map((message) => message.id);
  const decision = evaluateKnowledgeWrite({ ...input.scope, id, kind: "fact", subject: "relationship", temporalStatus: "past",
    statement: (input.app === "reading" ? "本关系中确认保存了一次共读记录，作品故事不是现实经历。" : "本关系中确认保存了一次观影记录，影视故事不是现实经历。")
      + (input.messages.some((message) => message.author === "character") ? "" : "这是一条单方留言，未证明角色当时回应。"),
    recordedAt: now, occurredAt: now, confidence: 1, userConfirmed: true,
    source: { kind: "deterministic_action", authorship: "system", actingIdentityId: input.scope.userIdentityId,
      messageAuthors: Object.fromEntries(input.messages.filter((message) => !message.confirmationAction).map((message) => [message.id, message.author])), app: input.app, sourceRecordId: input.recordId, eventId, messageIds: sourceIds,
      evidenceGroups: [sourceIds], messageRevisions: Object.fromEntries(input.messages.map((message) => [message.id, sourceRevision(message.text)])),
      evidenceKey: `${eventId}:${revision}`, retainedSnapshot: true, producer: "shared-media-archive.v1" } });
  if (!decision.accepted) return { success: false, error: "validation" as const };
  decision.claim.continuityVersion = 1;
  const current = loadKnowledgeClaims(); const summaries = loadConversationSummaries(); const continuity = loadCharacterContinuity();
  if (!current.valid || !summaries.valid || !continuity.valid || isForgottenKnowledge(decision.claim, continuity.value.forgotten)) return { success: false, error: "validation" as const };
  if (current.value.some((claim) => claim.id === id) && summaries.value.some((summary) => summary.sourceClaimIds.includes(id))) return { success: true };
  const episode = createConversationSummaryRecord({ id: `episode:${id}`, scope: input.scope, claims: [decision.claim], sourceMessageIds: sourceIds,
    generatedAt: now, generator: "shared-media-archive.v1", layer: "episode", rangeStartAt: Math.min(...input.messages.map((message) => message.occurredAt)),
    rangeEndAt: Math.max(...input.messages.map((message) => message.occurredAt)) });
  if (!episode) return { success: false, error: "validation" as const };
  // Multiple bounded episodes cover a long discussion instead of dropping early exchanges.
  const pieces: typeof episode[] = []; let text = ""; let refs: string[] = [];
  const flush = () => { if (text) {
    const times = input.messages.filter((message) => refs.includes(message.id)).map((message) => message.occurredAt);
    const start = Math.min(...times); const end = Math.max(...times);
    pieces.push({ ...episode, id: `episode:${eventId}:${sourceRevision(JSON.stringify([refs, text]))}`, sourceMessageIds: [...new Set(refs)],
      rangeStartAt: start, rangeEndAt: end, summary:
    `【${input.app === "reading" ? "共读" : "观影"}《${input.title.slice(0, 120)}》交流快照，${new Date(start).toISOString()}】\n作品内容与台词不属于现实经历。\n${text}` }); text = ""; refs = [];
  } };
  for (const message of input.messages) {
    const line = `${message.confirmationAction ? "用户当前确认动作，非当时原话" : message.author === "user" ? "用户原话" : "角色当时回应，非作品事实权威"}：${message.text}\n`;
    if (text.length + line.length > 1400) flush();
    if (line.length <= 1400) { text += line; refs.push(message.id); } else {
      for (let offset = 0; offset < line.length; offset += 1200) {
        text = `（原交流的连续片段，勿补齐缺失条件）${line.slice(offset, offset + 1200)}`; refs = [message.id]; flush();
      }
    }
  }
  flush();
  const retiredIds = new Set(current.value.filter((claim) => isExactTruthScope(claim, input.scope) && claim.source.producer === "shared-media-archive.v1"
    && claim.source.eventId === eventId && claim.id !== id && !claim.supersededById).map((claim) => claim.id));
  const records = appendKnowledgeClaims(current.value.map((claim) => retiredIds.has(claim.id)
    ? { ...claim, validTo: now, supersededById: id, retractionReason: "episode_updated" } : claim), [decision.claim]);
  return replaceMemoryStores({ [storageKeys.characterKnowledgeClaims]: records, [storageKeys.conversationSummaries]: [
    ...summaries.value.map((summary) => {
      const replacement = pieces.find((piece) => piece.id === summary.id);
      return replacement ? { ...replacement, generatedAt: summary.generatedAt } : summary.sourceClaimIds.some((claimId) => retiredIds.has(claimId)) ? { ...summary, status: "stale" } : summary;
    }),
    ...pieces.filter((piece) => !summaries.value.some((summary) => summary.id === piece.id))] });
}
