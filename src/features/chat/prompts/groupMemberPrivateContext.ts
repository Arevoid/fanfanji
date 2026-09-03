import type { Character, MemoryItem } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { MemoryService, formatMemoriesForPrompt } from "../../../domain/memory/MemoryService";
import type {
  BehaviorCorrectionRecord,
  ConversationSummaryRecord,
  KnowledgeClaim,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  countTruthRetrievalRecords,
  formatTruthRetrievalForPrompt,
  retrieveTruthForPrivatePrompt,
} from "../../characterKnowledge/services/truthRetrievalService";

export interface GroupMemberPrivateContextInput {
  member: Character;
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  activeIdentityId: string;
  memories: readonly MemoryItem[];
  claims: readonly KnowledgeClaim[];
  summaries: readonly ConversationSummaryRecord[];
  corrections: readonly BehaviorCorrectionRecord[];
  queryText: string;
  limit: number;
  alreadyPromptedTexts?: readonly string[];
}

export function buildIsolatedGroupMemberDefinitions(input: {
  publicDefinition: string;
  publicRoster: readonly string[];
  privateContext: string;
}): string {
  return `${input.publicDefinition}\n- 群成员公开名单：${input.publicRoster.join("、")}。名单只证明同处本群，不证明彼此认识或了解其他成员档案。${input.privateContext ? `\n\n${input.privateContext}` : ""}`;
}

/** Build one member's relation-private context. Never reuse it for another member. */
export function buildGroupMemberPrivateContext(input: GroupMemberPrivateContextInput): string {
  const relationship = findRelationshipForCanonicalCharacter(
    input.relationships,
    input.activeIdentityId,
    input.member.id,
    input.characters,
  );
  if (!relationship) return "";

  const scope = {
    relationId: relationship.id,
    characterId: relationship.characterId,
    userIdentityId: relationship.userIdentityId,
    conversationId: relationship.conversationId,
  };
  const truth = retrieveTruthForPrivatePrompt({
    scope,
    queryText: input.queryText,
    limit: input.limit,
    alreadyPromptedTexts: input.alreadyPromptedTexts,
    claims: input.claims,
    summaries: input.summaries,
    corrections: input.corrections,
  });
  const shadowedLegacyMemoryIds = new Set(truth.shadowedLegacyMemoryIds);
  const relationshipSummaryCount = relationship.compressedMemory?.trim() ? 1 : 0;
  const legacyMemoryLimit = Math.max(0, input.limit - countTruthRetrievalRecords(truth) - relationshipSummaryCount);
  const legacyMemories = legacyMemoryLimit > 0
    ? MemoryService.retrieveRelevantMemories({
      characterId: input.member.id,
      relationId: relationship.id,
      userIdentityId: relationship.userIdentityId,
      conversationId: relationship.conversationId,
      queryText: input.queryText,
      existingMemories: input.memories,
      limit: legacyMemoryLimit,
      maxCharacters: 2400,
      excludeCanonicalMirrors: true,
      scenario: "group-chat",
    }).filter((memory) =>
      !shadowedLegacyMemoryIds.has(memory.id) && !(memory.sourceKnowledgeClaimIds?.length),
    ).slice(0, legacyMemoryLimit)
    : [];

  const privateParts = [
    relationship.compressedMemory?.trim()
      ? `- 与用户的私聊关系摘要：\n${relationship.compressedMemory.trim()}`
      : "",
    formatMemoriesForPrompt(legacyMemories, "- 该成员自己与用户的私聊记忆：\n"),
    formatTruthRetrievalForPrompt(truth),
  ].filter(Boolean);
  if (privateParts.length === 0) return "";

  const speakerName = input.member.remark || input.member.name;
  return `[MEMBER_PRIVATE_CONTEXT member_id="${input.member.id}" speaker="${speakerName}"]
以下内容只属于 ${speakerName} 自己的认知，只能影响标记为 [SENDER_NAME: ${input.member.name}] 的发言。
其他群成员看不到、听不到、也不得引用或回应这里的信息；只有相关事实后来在群聊公开消息中被明确说出，才会成为其他成员可见的群内事实。
${privateParts.join("\n")}
[/MEMBER_PRIVATE_CONTEXT]`;
}
