import type { OfflineStory } from "../../../types";
import type { MemoryExtractionApiResult } from "../../../domain/memory/memoryTypes";
import { sourceRevision } from "../../../domain/characterKnowledge/knowledgeEvolution";

// Intentionally memory-only. Never pass these records to storage, logs, backups,
// prompts or model requests. Module reload discards every raw response.
export interface OfflineFailureResponse {
  text: string; category: string; wrapper: string; schema: string;
  modelTruncated: boolean; previewTruncated: boolean; logicalRequests: number;
}
const records = new Map<string, OfflineFailureResponse>();
const key = (story: OfflineStory) => JSON.stringify([story.id, story.characterId, story.ownerIdentityId,
  story.relationId, story.conversationId, sourceRevision(JSON.stringify(story.messages.map(m => [m.id,m.content,m.recalledAt,m.isImportedContext])))]);
export function clearOfflineFailureResponse(story: OfflineStory) { records.delete(key(story)); }
export function rememberOfflineFailureResponse(story: OfflineStory, response: Readonly<MemoryExtractionApiResult>, logicalRequests: number) {
  const metadata = response.structuredOutputTelemetry;
  const text = typeof response.text === "string" ? response.text : "";
  records.delete(key(story));
  records.set(key(story), { text: text.slice(0,65536), previewTruncated:text.length>65536,
    category:metadata?.failureReasonCode || "unknown", wrapper:metadata?.wrapperKind || "unknown",
    schema:metadata?.schemaRejectReasonCode || "unknown",
    modelTruncated:metadata?.failureReasonCode==="truncated_json" || metadata?.finishReasonKind==="length",
    logicalRequests });
  while(records.size>3)records.delete(records.keys().next().value!);
}
export function readOfflineFailureResponse(story: OfflineStory): Readonly<OfflineFailureResponse> | undefined {
  return records.get(key(story));
}
