import type { Character, MemoryItem, MemoryVaultSettings, Message, OfflineStory, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { createOfflineStoryHandoffMemory, filterOfflineExtractedFacts, getOfflineStorySummaryMarker } from "../../../domain/memory/offlineMemorySync";
import { MemoryService, formatDelicateMemoryDiary, formatExtractedMemorySummary } from "../../../domain/memory/MemoryService";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
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
  existingMemories: readonly MemoryItem[];
  offlineStoryPolicyInput?: MemoryExtractionContext["offlineStoryPolicyInput"];
  extractApi: MemoryExtractionApi;
}): Promise<{ memories: MemoryItem[]; acceptedClaims: KnowledgeClaim[]; fallbackParticipantNames: string[] }> {
  if (input.sourceMessages.length === 0) return { memories: [], acceptedClaims: [], fallbackParticipantNames: [] };
  const memories: MemoryItem[] = [];
  const acceptedClaims: KnowledgeClaim[] = [];
  const fallbackParticipantNames: string[] = [];
  await Promise.all(input.participants.map(async (participant) => {
    const relationship = findRelationshipForCanonicalCharacter(
      input.relationships,
      input.activeIdentityId,
      participant.id,
      input.characters,
    );
    if (!relationship) return;
    const isDelicate = participant.archiveTemplateType === "delicate";
    const headerLabel = isDelicate
      ? `【多人线下剧本《${input.story.title}》心境归档】`
      : `【多人线下剧本《${input.story.title}》关键剧情归档】`;
    const formatContent = (items: readonly string[], options?: { displayItems: readonly string[] }) =>
      `${isDelicate
        ? `${formatDelicateMemoryDiary(headerLabel, options?.displayItems || items)}\n【事实索引（系统）】\n${items.map((item) => `- ${item}`).join("\n")}`
        : formatExtractedMemorySummary(headerLabel, items)}\n[${getOfflineStorySummaryMarker(input.story)}]`;
    let extracted: MemoryItem[] = [];
    try {
      const result = await MemoryService.extractMemories({
        character: participant,
        characterId: participant.id,
        relationId: relationship.id,
        userIdentityId: relationship.userIdentityId,
        conversationId: relationship.conversationId,
        recentMessages: input.sourceMessages,
        existingMemories: input.existingMemories,
        scenario: "offline",
        apiKey: input.settings.apiKey,
        model: !input.recallSettings.extractModel || input.recallSettings.extractModel === "default-chat-model"
          ? (input.settings.selectedModel || "gemini-3.5-flash")
          : input.recallSettings.extractModel,
        apiEndpoint: input.settings.apiEndpoint,
        templateType: participant.archiveTemplateType,
        createId: () => createId("mem"),
        currentTime: () => input.now,
        filterItems: filterOfflineExtractedFacts,
        formatContent,
        offlineStoryPolicyInput: input.offlineStoryPolicyInput,
      }, input.extractApi);
      extracted = result.extractedMemories;
      acceptedClaims.push(...result.acceptedClaims);
    } catch (error) {
      console.warn(`多人线下记忆提取失败（${participant.name}），使用安全交接摘要：`, error);
    }
    if (extracted.length === 0) {
      fallbackParticipantNames.push(participant.name);
      extracted = [createOfflineStoryHandoffMemory({
        story: input.story,
        sourceMessages: input.sourceMessages,
        characterId: participant.id,
        relationId: relationship.id,
        characterName: participant.name,
        id: `offline-group-memory:${input.story.id}:${participant.id}`,
        timestamp: input.now,
        marker: "summary",
        includeConfirmedExcerpts: false,
      })];
    }
    memories.push(...extracted);
  }));
  return { memories, acceptedClaims, fallbackParticipantNames };
}
