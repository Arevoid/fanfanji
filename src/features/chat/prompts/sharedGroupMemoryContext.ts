import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { memoryRelevance } from "../../../domain/memory/memoryRelevance";
import { fitsMemoryTokenBudget } from "../../../domain/memory/memoryTokenBudget";
import { hashGroupMemoryMessage } from "../services/groupMemorySyncService";
import { shouldArchiveGroupMessage } from "../../../domain/memory/groupMemoryValue";
/** Public group requests may contain only exact-room archives granted to every current member. */
export function buildSharedGroupMemoryContext(input: { groupId: string; members: readonly Character[]; characters: readonly Character[];
  relationships: readonly CharacterRelationship[]; identityId: string; claims: readonly KnowledgeClaim[]; summaries: readonly ConversationSummaryRecord[];
  messages: readonly Message[]; alreadyPromptedIds: readonly string[]; query: string; limit?: number }) {
  if (!input.groupId || !input.members.length || !input.query.trim()) return "";
  const visibleMessages = new Map(input.messages.filter((message) => message.characterId === input.groupId
    && typeof message.content === "string" && Number.isFinite(message.timestamp) && Math.abs(message.timestamp) <= 8.64e15
    && (!message.conversationId || message.conversationId === `group:${input.groupId}`)).map((message) => [message.id, message]));
  const perMember = input.members.map((member) => {
    const relation = findRelationshipForCanonicalCharacter(input.relationships, input.identityId, member.id, input.characters);
    const granted = new Map<string, ConversationSummaryRecord>(); if (!relation) return granted;
    const scope = { characterId: relation.characterId, relationId: relation.id, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId };
    const anchors = input.claims.filter((claim) => isExactTruthScope(claim, scope) && claim.status === "active" && !claim.recallDisabled && !claim.supersededById
      && claim.source.producer === "group-memory-sync.v1" && claim.source.sourceRecordId === input.groupId
      && claim.source.kind === "automatic_summary" && claim.source.authorship === "system");
    for (const summary of input.summaries) {
      if (!isExactTruthScope(summary, scope) || summary.status !== "active" || summary.generator !== "group-memory-sync.v1"
        || summary.sourceMessageIds.length !== 1 || !summary.sourceClaimIds.length || !summary.sourceClaimIds.every((id) => anchors.some((claim) => claim.id === id))) continue;
      const source = visibleMessages.get(summary.sourceMessageIds[0]); if (!source || input.alreadyPromptedIds.includes(source.id)) continue;
      if (!shouldArchiveGroupMessage(source, [...visibleMessages.values()])) continue;
      const key = `group-memory-sync:${input.groupId}:${source.id}:${hashGroupMemoryMessage(source)}`;
      if (!summary.sourceClaimIds.every((id) => anchors.some((claim) => claim.id === id && claim.source.eventId === key))) continue;
      if (memoryRelevance(summary.summary, input.query) > 0) granted.set(key, summary);
    }
    return granted;
  });
  const candidates = [...perMember[0].entries()].filter(([key]) => perMember.every((granted) => granted.has(key)))
    .map(([, summary]) => summary).sort((a, b) => memoryRelevance(b.summary, input.query) - memoryRelevance(a.summary, input.query) || b.generatedAt - a.generatedAt);
  let text = "";
  for (const summary of candidates.slice(0, Math.max(1, Math.min(6, input.limit || 3)))) {
    const source = visibleMessages.get(summary.sourceMessageIds[0])!;
    const time = new Date(source.timestamp).toISOString();
    const candidate = text + `\n[本群共享归档记录，原发言时间 ${time}] ${summary.summary}\n这是已授权读取的群记录，非私聊；只表示当时说过，不代表当前状态或履约，不证明所有成员当时亲身参与。仅在相关时自然使用。`;
    if (candidate.length <= 1500 && fitsMemoryTokenBudget(candidate, 1800)) text = candidate;
  }
  return text;
}
