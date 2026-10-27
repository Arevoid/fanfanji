import {extractOfflineArchiveWithCheckpoint} from "./offlineArchiveExtraction";
import type {OfflineArchiveCheckpoint} from "../../../types";
import type {MemoryReviewFailure} from "../../../domain/memory/memoryReviewFailure";
import { resolveCharacterTextSettings } from "../../../domain/character/characterTextApiRouting";
import type { Character, MemoryVaultSettings, Message, OfflineStory, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { filterOfflineExtractedFacts, getOfflineStorySummaryId,offlineStorySummaryClaims,offlineMemorySourceRevision } from "../../../domain/memory/offlineMemorySync";
import { loadKnowledgeClaims,appendToKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { MemoryService } from "../../../domain/memory/MemoryService";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { createConversationSummaryRecord } from "../../characterKnowledge/services/conversationSummaryService";
import type { MemoryExtractionApi, MemoryExtractionContext } from "../../../domain/memory/memoryTypes";
import { createId } from "../../../core/id/createId";
import { createMemorySettingReviewer } from "../../characterKnowledge/services/memorySettingReviewService";

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
  persistCheckpoint?:(characterId:string,work:OfflineArchiveCheckpoint)=>Promise<void>;
}): Promise<{ summaries: ConversationSummaryRecord[]; acceptedClaims: KnowledgeClaim[]; fallbackParticipantNames: string[]; skippedParticipantIds: string[];reviewFailures?:MemoryReviewFailure[]; impressionCandidates?: readonly unknown[] }> {
  if (input.sourceMessages.length === 0) return { summaries: [], acceptedClaims: [], fallbackParticipantNames: [], skippedParticipantIds: [] };
  const reviewFailures:MemoryReviewFailure[]=[];
  const summaries: ConversationSummaryRecord[] = [];
  const acceptedClaims: KnowledgeClaim[] = [];
  const impressionCandidates: unknown[] = [];
  const fallbackParticipantNames: string[] = [];
  const skippedParticipantIds: string[] = [];
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
    if (!relationship) return { summaries, acceptedClaims, fallbackParticipantNames, skippedParticipantIds,reviewFailures,impressionCandidates };
    let extractedClaims: KnowledgeClaim[] = [];
    try {
      const settings=resolveCharacterTextSettings(input.settings,participant);
      const context:MemoryExtractionContext = {
        requireFactResolution: true,
        character: participant,
        reviewAuthorizedSettings:createMemorySettingReviewer(participant,{characterId:participant.id,relationId:relationship.id,userIdentityId:relationship.userIdentityId,conversationId:relationship.conversationId},"group",{...settings,selectedModel:settings.selectedModel}),
        characterId: participant.id,
        relationId: relationship.id,
        userIdentityId: relationship.userIdentityId,
        conversationId: relationship.conversationId,
        recentMessages: input.sourceMessages,
        scenario: "offline",
        apiKey: settings.apiKey,
        streamCompatible:settings.streamCompatible,
        model: (settings.selectedModel || "gemini-3.5-flash"),
        apiEndpoint: settings.apiEndpoint,
        templateType: participant.archiveTemplateType,
        existingMemories: [],
        createId: () => createId("mem"),
        currentTime: () => input.now,
        filterItems: filterOfflineExtractedFacts,
        formatContent: (items) => items.join("\n"),
        offlineStoryPolicyInput: input.offlineStoryPolicyInput,
      };
      const result=input.persistCheckpoint?await extractOfflineArchiveWithCheckpoint({story:input.story,character:participant,settings,scope:{characterId:participant.id,relationId:relationship.id,userIdentityId:relationship.userIdentityId,conversationId:relationship.conversationId},context,extractApi:input.extractApi,persist:work=>input.persistCheckpoint!(participant.id,work)})
        :await MemoryService.extractMemoryBatches(context,input.extractApi);
      reviewFailures.push(...(result.reviewFailures||[]));
      if (result.apiError) throw new Error(result.apiError);
      acceptedClaims.push(...(result.discardedClaims||[]));
      if (!result.acceptedClaims.length && result.valueSkippedCount && result.valueSkippedCount === result.rejectedCandidateCount) {
        skippedParticipantIds.push(participant.id);
        continue;
      }
      extractedClaims = result.acceptedClaims;
      acceptedClaims.push(...result.acceptedClaims);
      impressionCandidates.push(...(result.impressionCandidates || []));
    } catch (error) {
      console.warn(`多人线下记忆提取失败（${participant.name}），使用安全交接摘要：`, error);
    }
    if(!extractedClaims.length){fallbackParticipantNames.push(participant.name);continue;}
    if(extractedClaims.every(claim=>claim.admissionStatus==="review")){skippedParticipantIds.push(participant.id);continue;}
    const uncertainSources=new Set(appendToKnowledgeClaims(loadKnowledgeClaims().value,extractedClaims).filter(claim=>claim.characterId===participant.id&&claim.relationId===relationship.id&&claim.source.storyId===input.story.id&&claim.admissionStatus==="review").flatMap(claim=>claim.source.messageIds||[]));
    const summaryClaims=offlineStorySummaryClaims(input.story.id,{characterId:participant.id,relationId:relationship.id,userIdentityId:relationship.userIdentityId,conversationId:relationship.conversationId},appendToKnowledgeClaims(loadKnowledgeClaims().value,extractedClaims),[]);
    const summary = createConversationSummaryRecord({
      id: getOfflineStorySummaryId(input.story, participant.id),
      scope: {
        relationId: relationship.id,
        characterId: participant.id,
        userIdentityId: relationship.userIdentityId,
        conversationId: relationship.conversationId,
      },
      claims: summaryClaims,
      sourceMessageIds: [...new Set([...(input.story.syncedSourceMessageIds||[]),...input.sourceMessages.map(message=>message.id),...summaryClaims.flatMap(claim=>claim.source.messageIds||[])])],
      sourceMessageRevisions:Object.fromEntries([...Object.entries(input.story.syncedSourceMessageRevisions||{}),...input.sourceMessages.map(message=>[message.id,offlineMemorySourceRevision(message)] as const)].filter(([id])=>!uncertainSources.has(id))),
      generatedAt: input.now,
      generator: "offline-story-participant.v2",
      layer: "episode",
    });
    if (summary) summaries.push(summary);
    else {
      fallbackParticipantNames.push(participant.name);
    }
  }
  return { summaries, acceptedClaims, fallbackParticipantNames, skippedParticipantIds,reviewFailures,impressionCandidates };
}
