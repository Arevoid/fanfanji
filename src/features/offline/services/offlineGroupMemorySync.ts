import type { Character, MemoryVaultSettings, Message, OfflineStory, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { filterOfflineExtractedFacts, getOfflineStorySummaryId } from "../../../domain/memory/offlineMemorySync";
import { MemoryService } from "../../../domain/memory/MemoryService";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { createConversationSummaryRecord } from "../../characterKnowledge/services/conversationSummaryService";
import type { MemoryExtractionApi, MemoryExtractionContext } from "../../../domain/memory/memoryTypes";
import { createId } from "../../../core/id/createId";

export async function createOfflineGroupParticipantMemories(input: {
  story: OfflineStory;
  participants: readonly Character[];
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  activeIdentityId: string;
  sourceMessages: readonly Message[];
  userName: string;
  now: number;
  settings: UserSettings;
  recallSettings: MemoryVaultSettings;
  offlineStoryPolicyInput?: MemoryExtractionContext["offlineStoryPolicyInput"];
  extractApi: MemoryExtractionApi;
}): Promise<{ summaries: ConversationSummaryRecord[]; acceptedClaims: KnowledgeClaim[]; fallbackParticipantNames: string[] }> {
  if (input.sourceMessages.length === 0) return { summaries: [], acceptedClaims: [], fallbackParticipantNames: [] };
  const summaries: ConversationSummaryRecord[] = [];
  const acceptedClaims: KnowledgeClaim[] = [];
  const fallbackParticipantNames: string[] = [];
  // Extract one participant at a time. Custom providers frequently enforce a
  // low concurrent-request limit; firing every participant at once made one
  // member fall into the empty-result fallback even when the same story was
  // successfully extracted for the other members.
  for (const participant of input.participants) {
    const relationship = findRelationshipForCanonicalCharacter(
      input.relationships,
      input.activeIdentityId,
      participant.id,
      input.characters,
    );
    if (!relationship) return { summaries, acceptedClaims, fallbackParticipantNames };
    let extractedClaims: KnowledgeClaim[] = [];
    try {
      const result = await MemoryService.extractMemories({
        character: participant,
        characterId: participant.id,
        relationId: relationship.id,
        userIdentityId: relationship.userIdentityId,
        conversationId: relationship.conversationId,
        recentMessages: input.sourceMessages,
        scenario: "offline",
        apiKey: input.settings.apiKey,
        model: !input.recallSettings.extractModel || input.recallSettings.extractModel === "default-chat-model"
          ? (input.settings.selectedModel || "gemini-3.5-flash")
          : input.recallSettings.extractModel,
        apiEndpoint: input.settings.apiEndpoint,
        templateType: participant.archiveTemplateType,
        existingMemories: [],
        createId: () => createId("mem"),
        currentTime: () => input.now,
        filterItems: filterOfflineExtractedFacts,
        formatContent: (items) => items.join("\n"),
        offlineStoryPolicyInput: input.offlineStoryPolicyInput,
      }, input.extractApi);
      extractedClaims = result.acceptedClaims;
      acceptedClaims.push(...result.acceptedClaims);
    } catch (error) {
      console.warn(`多人线下记忆提取失败（${participant.name}），使用安全交接摘要：`, error);
    }
    const summary = createConversationSummaryRecord({
      id: getOfflineStorySummaryId(input.story, participant.id),
      scope: {
        relationId: relationship.id,
        characterId: participant.id,
        userIdentityId: relationship.userIdentityId,
        conversationId: relationship.conversationId,
      },
      claims: extractedClaims,
      sourceMessageIds: input.sourceMessages.map((message) => message.id),
      generatedAt: input.now,
      generator: "offline-story-participant.v2",
    });
    if (summary) summaries.push(summary);
    else {
      fallbackParticipantNames.push(participant.name);
    }
  }
  return { summaries, acceptedClaims, fallbackParticipantNames };
}
