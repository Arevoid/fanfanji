import type { UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { loadBehaviorCorrections } from "../../../core/storage/repositories/behaviorCorrectionRepository";
import { contributeSemanticDirectReplyTruthContext } from "./semanticMemoryRecallService";
import { formatTruthRetrievalForPrompt } from "./truthRetrievalService";

export type MemoryContextSurface = "chat" | "regenerate" | "offline" | "diary" | "reading" | "cinema" | "moment" | "forum" | "group" | "music";
export interface MemoryContextRequest {
  surface: MemoryContextSurface; relation: CharacterRelationship; characterId: string; userIdentityId: string;
  query: string; settings: UserSettings; audience: "relation_private" | "public" | "shared_group";
  maxCharacters?: number;
  contextId?:string;
  /** Only messages also supplied by this caller in the same final request. */
  alreadyPromptedTexts?: readonly string[];
}
/** Private knowledge is read only for an explicit matching relation. Public output receives no private dump. */
export async function buildMemoryContext(input: MemoryContextRequest): Promise<string> {
  const relation = input.relation;
  if (input.audience !== "relation_private" || relation.characterId !== input.characterId || relation.userIdentityId !== input.userIdentityId
    || !relation.id || !relation.conversationId || !input.query.trim()) return "";
  const result = await contributeSemanticDirectReplyTruthContext({ configuration: input.settings.memoryEmbedding, retrieval: {
    scope: { characterId: relation.characterId, relationId: relation.id, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId },
    queryText: input.query, scenario: "private", claims: loadKnowledgeClaims().value,
    mentionChannel:input.surface==="diary"?"diary":input.surface==="group"&&input.contextId?`group:${input.contextId}`:"conversation",
    alreadyPromptedTexts: input.alreadyPromptedTexts,
    summaries: loadConversationSummaries().value, corrections: loadBehaviorCorrections().value,
    maxCharacters: input.maxCharacters ?? 1800, limit: 6,
  } });
  const guard = input.surface === "reading" ? "\n共读记忆中的作品情节和旧回复不是现实事实，也不能扩大当前已读边界。"
    : input.surface === "cinema" ? "\n观影记忆中的剧情、台词和旧回复不是现实事实或影片权威资料，也不能扩大当前已播放边界。" : "";
  const text = formatTruthRetrievalForPrompt(result, {
    maxCharacters: Math.max(0, (input.maxCharacters ?? 1800) - guard.length),
    maxTokens: Math.max(0, (result.promptTokenLimit ?? 3000) - new TextEncoder().encode(guard).length),
  });
  if (!text) return "";
  return text + guard;
}
