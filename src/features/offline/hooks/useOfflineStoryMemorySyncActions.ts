import {extractOfflineArchiveWithCheckpoint} from "../services/offlineArchiveExtraction";
import { applyArchivedImpressions } from "../../characterKnowledge/services/characterContinuityService";
import {needsOfflineMemoryRepair,rebuildOfflineStoryMemory} from "../services/offlineMemoryRepair";
import {resolveOfflineMemoryRepairScope} from "../services/offlineMemoryRepairScope";
import {describeMemoryReviewFailure} from "../../../domain/memory/memoryReviewFailure";
import { nextOfflineArchiveBatch, mergeOfflineArchiveProgress } from "../../../domain/memory/offlineArchivePolicy";
import { enqueueOfflineArchive, readOfflineArchiveStory, hasOfflineArchiveReader, type OfflineArchiveOptions } from "../services/offlineArchiveQueue";
import { resolveCharacterTextSettings } from "../../../domain/character/characterTextApiRouting";
import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Character, MemoryItem, MemoryVaultSettings, OfflineStory, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { appendMany as appendKnowledgeClaims, loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { conversationSummaryRepository } from "../../../core/storage/repositories/conversationSummaryRepository";
import { loadOfflineStories } from "../../../core/storage/repositories/offlineRepository";
import { apiChat, apiExtractMemoriesWithModelFallback } from "../../../utils/apiHelper";
import { prepareMemoryIdentityRegistry } from "../../characterKnowledge/services/memoryIdentityRegistryService";
import { createMemorySettingReviewer } from "../../characterKnowledge/services/memorySettingReviewService";
import { formatDelicateMemoryDiary, formatExtractedMemorySummary, MemoryService } from "../../../domain/memory/MemoryService";
import { commitMemoryWriteBundle } from "../../../domain/memory/memoryWriteCoordinator";
import { createId } from "../../../core/id/createId";
import { filterOfflineExtractedFacts, getOfflineMemorySourceMessages, getOfflineStorySummaryId, hasUnsyncedOfflineMemoryProgress,offlineMemorySourceRevision,isOfflineStoryMessageSyncable,offlineStorySummaryClaims } from "../../../domain/memory/offlineMemorySync";
import { canSyncOfflineStoryToMemory } from "../../../domain/offlineStory/offlineStoryFactPolicy";
import { resolveOfflineStoryCharacterIds } from "../../../domain/character/characterIdentity";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { applyConfirmedOfflineRelationshipTransition } from "../../../domain/relationship/offlineRelationshipTransition";
import { captureOfflineStoryCompletedEvent } from "../../characterLife/services/offlineStoryEventCaptureService";
import { createOfflineGroupParticipantMemories } from "../services/offlineGroupMemorySync";
import { createConversationSummaryRecord } from "../../characterKnowledge/services/conversationSummaryService";
import { notifyOfflineMemorySync } from "../services/offlineMemorySyncNotifications";

interface UseOfflineStoryMemorySyncActionsOptions {
  requestMemoryReview?: typeof apiChat;
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  settings: UserSettings;
  memories: readonly MemoryItem[];
  recallSettings: MemoryVaultSettings;
  activeIdentityId: string;
  activeStoryRef: MutableRefObject<OfflineStory | null>;
  memorySyncInFlightRef: MutableRefObject<Set<string>>;
  setMemorySyncingStoryId: Dispatch<SetStateAction<string | null>>;
  onSaveOfflineStory: (story: OfflineStory) => boolean | Promise<boolean>;
  onSaveMemories: (memories: MemoryItem[]) => void;
  onPersistMemories?: (memories: MemoryItem[]) => boolean | Promise<boolean>;
  onSaveRelationships: (relationships: CharacterRelationship[]) => void;
  saveActiveStorySnapshot: (story: OfflineStory) => void;
  showToast: (message: string) => void;
  needsLegacyHandoffRepair: (story: OfflineStory) => boolean;
  needsMissingSummaryRepair: (story: OfflineStory) => boolean;
  needsUninformativeSummaryRepair: (story: OfflineStory) => boolean;
}

export function createOfflineStoryMemorySyncActions({
  requestMemoryReview,
  characters,
  relationships,
  settings: globalSettings,
  memories,
  recallSettings,
  activeIdentityId,
  activeStoryRef,
  memorySyncInFlightRef,
  setMemorySyncingStoryId,
  onSaveOfflineStory,
  onSaveMemories,
  onPersistMemories,
  onSaveRelationships,
  saveActiveStorySnapshot,
  showToast,
  needsLegacyHandoffRepair,
  needsMissingSummaryRepair,
  needsUninformativeSummaryRepair,
}: UseOfflineStoryMemorySyncActionsOptions) {
  const runBatch = async (
    story: OfflineStory,
    options: OfflineArchiveOptions = {},
  ): Promise<OfflineStory> => {
    if (memorySyncInFlightRef.current.has(story.id)) {
      showToast("剧情记忆正在同步中，请稍候…");
      return story;
    }
    const repairingLegacyHandoff = !options.incrementalOnly&&needsLegacyHandoffRepair(story);
    const legacyArchiveNeedsRepair=needsOfflineMemoryRepair(story);
    const repairingMissingSummary = !options.incrementalOnly&&needsMissingSummaryRepair(story);
    const repairingUninformativeSummary = !options.incrementalOnly&&needsUninformativeSummaryRepair(story);
    const manualRetryAfterFailure = (story.memorySyncStatus === "failed"||story.memorySyncStatus === "partial") && options.syncIntent === "manual_settings";
    if(options.syncIntent!=="manual_settings"&&!hasUnsyncedOfflineMemoryProgress(story))return story;
    if (!hasUnsyncedOfflineMemoryProgress(story) && !repairingLegacyHandoff && !repairingMissingSummary && !repairingUninformativeSummary && !manualRetryAfterFailure) {
      showToast("当前进展已经同步，无需重复处理");
      return story;
    }
    let sourceMessages = nextOfflineArchiveBatch(getOfflineMemorySourceMessages(story,{includeSynced:options.syncIntent==="manual_settings"&&(repairingLegacyHandoff||repairingUninformativeSummary)}));
    const resumable=story.memoryArchiveWork?.[story.characterId];
    if(resumable?.failures.length&&resumable.scope.characterId===story.characterId&&resumable.scope.relationId===story.relationId
      &&resumable.scope.userIdentityId===story.ownerIdentityId&&resumable.scope.conversationId===story.conversationId){
      const previousWindow=story.messages.filter(message=>resumable.sourceRevisions[message.id]===offlineMemorySourceRevision(message));
      if(previousWindow.length===Object.keys(resumable.sourceRevisions).length)sourceMessages=previousWindow;
    }
    const participantCharacters = resolveOfflineStoryCharacterIds(story, [...characters])
      .map((characterId) => characters.find((item) => item.id === characterId))
      .filter((item): item is Character => Boolean(item && !item.isGroupChat));
    const participantRelationships = participantCharacters.map((participant) =>
      findRelationshipForCanonicalCharacter([...relationships], activeIdentityId, participant.id, [...characters]),
    ).filter((relationship): relationship is CharacterRelationship => Boolean(relationship));
    const offlineStoryPolicyInput = {
      story,
      userConfirmed: options.userConfirmed === true,
      syncIntent: options.syncIntent,
      // Confirmation applies to this participated story; the extractor still
      // receives only the new revision window below. An AI reply appended after
      // the last sync must not require resending old user messages as new work.
      sourceMessages: story.messages.filter(isOfflineStoryMessageSyncable),
      participantRelationIds: participantRelationships.map((relationship) => relationship.id),
    };
    if (!canSyncOfflineStoryToMemory(offlineStoryPolicyInput)) {
      if(options.syncIntent==="manual_settings")showToast("当前剧情的角色关系范围或用户参与来源不完整，未发起模型请求；请先核对剧情所属角色及原始内容。");
      return story;
    }

    const character = characters.find((item) => item.id === story.characterId);
    if (!character) {
      showToast("当前线下故事没有可同步的角色资料");
      return story;
    }
    let settings=globalSettings;
    const isGroupStory = Boolean(
      (participantCharacters.length > 1 && !story.relationId)
      || (character.isGroupChat && participantCharacters.length > 0),
    );
    const now = Date.now();
    const currentStory=()=>{
      if(hasOfflineArchiveReader()){
        const live=readOfflineArchiveStory(story.id);
        if(!live)throw Error("offline_story_source_unavailable");
        // A generated snapshot may still be ahead of its serialized persistence callback.
        return activeStoryRef.current?.id===story.id&&activeStoryRef.current.updatedAt>live.updatedAt?activeStoryRef.current:live;
      }
      if(activeStoryRef.current?.id===story.id)return activeStoryRef.current;
      const stored=loadOfflineStories([]);
      if(!stored.valid)throw Error("无法核对剧情来源，未提交同步结果");
      const latest=stored.value.find(candidate=>candidate.id===story.id);
      if(!latest)throw Error("剧情已删除或来源不可用，本次结果未提交");
      return latest.updatedAt>=story.updatedAt?latest:story;
    };
    const assertSourceLease=()=>{const live=currentStory();if(live.characterId!==story.characterId||live.relationId!==story.relationId||live.ownerIdentityId!==story.ownerIdentityId
      ||sourceMessages.some(message=>!live.messages.some(candidate=>candidate.id===message.id&&offlineMemorySourceRevision(candidate)===offlineMemorySourceRevision(message))))throw Error("剧情来源已经修改，本次结果未提交，请重试");};
    const markSynced = (memoryIds: string[] = []): OfflineStory => {
      assertSourceLease();
      const { lastMemorySyncError: _lastMemorySyncError, ...storyWithoutSyncError } = currentStory();
      const progress:OfflineStory = {
        ...storyWithoutSyncError,
        archivedAt: now,
        archivedMemoryIds: Array.from(new Set([...(storyWithoutSyncError.archivedMemoryIds || []), ...memoryIds])),
        syncedSourceMessageIds: Array.from(new Set([...(storyWithoutSyncError.syncedSourceMessageIds || []), ...sourceMessages.map((message) => message.id)])),
        syncedSourceMessageRevisions:{...Object.fromEntries(storyWithoutSyncError.messages.filter(message=>storyWithoutSyncError.syncedSourceMessageRevisions?.[message.id]===offlineMemorySourceRevision(message)).map(message=>[message.id,offlineMemorySourceRevision(message)])),...Object.fromEntries(sourceMessages.map(message=>[message.id,offlineMemorySourceRevision(message)]))},
        lastSyncedMessageCount: sourceMessages.length === getOfflineMemorySourceMessages(story).length ? story.messages.length : (story.lastSyncedMessageCount || 0),
        lastMemorySyncAt: now,
        memorySyncStatus: sourceMessages.length < getOfflineMemorySourceMessages(story).length ? "pending" : "synced",
        memoryArchiveVersion:legacyArchiveNeedsRepair?story.memoryArchiveVersion:3,
        memorySyncOutcome:"retained",
        updatedAt: now,
      };
      return {...progress,memorySyncStatus:getOfflineMemorySourceMessages(progress).length?"pending":"synced"};
    };
    const persistSynced=async(synced:OfflineStory)=>{if(!await onSaveOfflineStory(synced))throw Error("剧情同步进度保存失败，未标记完成");if(activeStoryRef.current?.id===story.id)saveActiveStorySnapshot(mergeOfflineArchiveProgress(activeStoryRef.current,synced));};

    memorySyncInFlightRef.current.add(story.id);
    setMemorySyncingStoryId(story.id);
    notifyOfflineMemorySync({ message: "正在总结并同步剧情记忆，请稍候…" });
    try {
      settings=resolveCharacterTextSettings(globalSettings,character);
      if (sourceMessages.length === 0) {
        const syncedStory = markSynced();
        await persistSynced(syncedStory);
        if (options.userConfirmed&&!options.backgroundProgress) captureOfflineStoryCompletedEvent({ story: syncedStory, userIdentityId: relationships.find((relation) => relation.id === syncedStory.relationId)?.userIdentityId, sourceMessages, userConfirmed: true, recordedAt: now });
        notifyOfflineMemorySync({ message: "没有可提取的线下新增剧情，已保留故事内容" });
        return syncedStory;
      }

      if (isGroupStory) {
        const groupResult = await createOfflineGroupParticipantMemories({ story, participants: participantCharacters, characters: [...characters], relationships: [...relationships], activeIdentityId, sourceMessages, userName: settings.name, now, settings, recallSettings, offlineStoryPolicyInput,
          persistCheckpoint:async(characterId,work)=>{assertSourceLease();const live=currentStory();const checkpoint={...live,memoryArchiveWork:{...live.memoryArchiveWork,[characterId]:work},updatedAt:Date.now()};if(!await onSaveOfflineStory(checkpoint))throw Error("offline_checkpoint_write_failed");if(activeStoryRef.current?.id===story.id)activeStoryRef.current=checkpoint;},extractApi: (params) => apiExtractMemoriesWithModelFallback(params, settings.selectedModel) });
        assertSourceLease();
        const write = await commitMemoryWriteBundle({
          claims: groupResult.acceptedClaims,
          summaries: groupResult.summaries,
          appendClaims: (claims) => {
            // Kept as an injected callback below so the coordinator owns the
            // ordering and failure boundary for group sync as well.
            return appendKnowledgeClaims(claims);
          },
          appendSummaries: (summaries) => conversationSummaryRepository.appendMany(summaries),
        });
        if (!write.canonicalWritten) throw new Error("Offline group story knowledge persistence failed");
        if (!write.summaryWritten) throw new Error("Offline group story summary persistence failed");
        if (groupResult.impressionCandidates?.length) {
          const scopes = new Map(groupResult.acceptedClaims.map(claim => [claim.relationId, claim]));
          for (const claim of scopes.values()) applyArchivedImpressions({ characterId: claim.characterId, relationId: claim.relationId,
            userIdentityId: claim.userIdentityId, conversationId: claim.conversationId }, groupResult.impressionCandidates);
        }
        const incomplete=Boolean(groupResult.fallbackParticipantNames.length||groupResult.reviewFailures?.length);
        const syncedStory:OfflineStory=incomplete?{...currentStory(),memorySyncStatus:"partial",lastMemorySyncError:(groupResult.reviewFailures||[]).map(failure=>describeMemoryReviewFailure(failure.code)).join(";")||"offline_participant_extraction_incomplete"}:
          {...markSynced(),memoryArchiveWork:{},memorySyncOutcome:groupResult.acceptedClaims.some(claim=>claim.admissionStatus==="review")?"review":"retained"};
        await persistSynced(syncedStory);
        const fallbackSuffix = groupResult.fallbackParticipantNames.length > 0
          ? `；${groupResult.fallbackParticipantNames.join("、")}未返回可用摘要，本次不写入无意义的占位记忆`
          : "";
        notifyOfflineMemorySync({ message: incomplete
          ? `已保存通过的多人剧情记忆；部分提取或复核尚未完成，原文与处理进度已保留。${syncedStory.lastMemorySyncError || ""}`
          : `多人线下剧情已分别同步到每位参与成员${fallbackSuffix}` });
        return syncedStory;
      }
      if (character.isGroupChat) throw new Error("Offline group story participant scope is invalid");

      const relationship = relationships.find((relation) => relation.id === story.relationId && relation.characterId === story.characterId && relation.conversationId === story.conversationId);
      if (!relationship) throw new Error("Offline story relationship scope is invalid");
      const isDelicate = character.archiveTemplateType === "delicate";
      const headerLabel = isDelicate ? `【线下剧本《${story.title}》心境归档】` : `【线下剧本《${story.title}》关键剧情归档】`;
      let confirmedFacts: string[] = [];
      let acceptedOfflineClaims: KnowledgeClaim[] = [];
      const result = await extractOfflineArchiveWithCheckpoint({story:currentStory(),character,scope:{characterId:story.characterId,relationId:relationship.id,userIdentityId:relationship.userIdentityId,conversationId:relationship.conversationId},settings,reviewRequest:requestMemoryReview,
        persist:async work=>{assertSourceLease();const live=currentStory();const checkpoint={...live,memoryArchiveWork:{...live.memoryArchiveWork,[character.id]:work},updatedAt:Date.now()};
          if(!await onSaveOfflineStory(checkpoint))throw Error("剧情提取进度保存失败，未开始后续复核");
          if(activeStoryRef.current?.id===story.id)activeStoryRef.current=checkpoint;
        },context:{
        requireFactResolution: true,
        character, characterId: story.characterId, relationId: relationship.id, userIdentityId: relationship.userIdentityId, conversationId: relationship.conversationId,
        recentMessages: sourceMessages, existingMemories: [], scenario: "offline", apiKey: settings.apiKey,streamCompatible:settings.streamCompatible,
        existingClaims: loadKnowledgeClaims().value,
        reviewAuthorizedSettings:createMemorySettingReviewer(character,{characterId:story.characterId,relationId:relationship.id,userIdentityId:relationship.userIdentityId,conversationId:relationship.conversationId},"offline",{...settings,selectedModel:settings.selectedModel}),
        prepareSemanticRegistry: (query) => prepareMemoryIdentityRegistry({ characterId: story.characterId, relationId: relationship.id,
          userIdentityId: relationship.userIdentityId, conversationId: relationship.conversationId }, settings, query),
        model: (settings.selectedModel || "gemini-3.5-flash"),
        apiEndpoint: settings.apiEndpoint, templateType: character.archiveTemplateType, filterItems: filterOfflineExtractedFacts, offlineStoryPolicyInput,
        createId: () => createId("mem"), currentTime: () => Date.now(),
        formatContent: (items, formatOptions) => `${isDelicate ? `${formatDelicateMemoryDiary(headerLabel, formatOptions?.displayItems || items)}\n${items.map((item) => `- ${item}`).join("\n")}` : formatExtractedMemorySummary(headerLabel, items)}`,
      },extractApi:(params) => apiExtractMemoriesWithModelFallback(params, settings.selectedModel)});
      assertSourceLease();
      if (result.apiError) throw new Error(result.apiError);
      acceptedOfflineClaims = result.acceptedClaims;
      if(result.discardedClaims?.length&&!appendKnowledgeClaims(result.discardedClaims).success)throw Error("offline_discard_decision_write_failed");
      if(!acceptedOfflineClaims.length&&result.valueSkippedCount&&result.valueSkippedCount===result.rejectedCandidateCount){
        const skipped={...markSynced(),memoryArchiveWork:{},memorySyncReport:{retained:0,review:0,skipped:result.valueSkippedCount||0,failed:0},memorySyncOutcome:"skipped" as const};await persistSynced(skipped);
        notifyOfflineMemorySync({message:"新增剧情已检查，没有需要长期保留的内容，原文仍保留"});return skipped;
      }
      const reviewCount=acceptedOfflineClaims.filter(claim=>claim.admissionStatus==="review").length;
      const reviewFailures=result.reviewFailures||[];
      const failedIds=new Set(reviewFailures.flatMap(failure=>failure.candidateIds));
      const retainedCount=acceptedOfflineClaims.filter(claim=>claim.admissionStatus!=="review"&&!failedIds.has(claim.id)).length;
      const failedSourceIds=new Set(acceptedOfflineClaims.filter(claim=>failedIds.has(claim.id)).flatMap(claim=>claim.source.messageIds||[]));
      const uncertainSourceIds=new Set([...new Map([...loadKnowledgeClaims().value.filter(claim=>claim.characterId===character.id&&claim.relationId===relationship.id&&claim.userIdentityId===relationship.userIdentityId&&claim.source.storyId===story.id),...acceptedOfflineClaims].map(claim=>[claim.id,claim])).values()].filter(claim=>claim.admissionStatus==="review").flatMap(claim=>claim.source.messageIds||[]));
      confirmedFacts = result.acceptedClaims.filter((claim) => claim.status === "active" && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted")).map((claim) => claim.statement);
      if (acceptedOfflineClaims.length === 0) {
        const rejectedHint = result.rejectedCandidateCount > 0
          ? `接口返回了${result.rejectedCandidateCount}条候选，但都未通过来源或事实校验`
          : "接口没有返回可用的结构化候选";
        throw new Error(`${rejectedHint}，未写入占位记忆。`);
      }
      const buildExtractedSummary=()=>{
      const summaryClaims=offlineStorySummaryClaims(story.id,{characterId:relationship.characterId,relationId:relationship.id,userIdentityId:relationship.userIdentityId,conversationId:relationship.conversationId},loadKnowledgeClaims().value,[]);
      const extractedSummary = createConversationSummaryRecord({
        id: getOfflineStorySummaryId(story),
        scope: {
          relationId: relationship.id,
          characterId: relationship.characterId,
          userIdentityId: relationship.userIdentityId,
          conversationId: relationship.conversationId,
        },
        claims: summaryClaims,
        sourceMessageIds: [...new Set([...(story.syncedSourceMessageIds||[]),...sourceMessages.map(message=>message.id),...summaryClaims.flatMap(claim=>claim.source.messageIds||[])])],
        sourceMessageRevisions:Object.fromEntries([...Object.entries(story.syncedSourceMessageRevisions||{}),...sourceMessages.map(message=>[message.id,offlineMemorySourceRevision(message)] as const)].filter(([id])=>!uncertainSourceIds.has(id))),
        generatedAt: now,
        layer: "episode",
        generator: "offline-story.v2",
      });
      if (!extractedSummary && retainedCount>0) {
        throw new Error("已提取候选，但无法生成带来源的剧情摘要，未标记为已同步。");
      }
      return extractedSummary;
      };
      const write = await commitMemoryWriteBundle({
        claims: acceptedOfflineClaims,
        buildSummary: buildExtractedSummary,
        appendClaims: (claims) => appendKnowledgeClaims(claims),
        appendSummaries: (summaries) => conversationSummaryRepository.appendMany(summaries),
      });
      if (!write.canonicalWritten) throw new Error("Offline story knowledge persistence failed");
      if (!write.summaryWritten) throw new Error("Offline story summary persistence failed");
      if (result.impressionCandidates?.length) applyArchivedImpressions({ characterId: story.characterId, relationId: relationship.id,
        userIdentityId: relationship.userIdentityId, conversationId: relationship.conversationId }, result.impressionCandidates);
      const nextRelationships = applyConfirmedOfflineRelationshipTransition({ relationships: [...relationships], relationId: relationship.id, claims: acceptedOfflineClaims, now });
      if (nextRelationships.some((item, index) => item !== relationships[index])) onSaveRelationships(nextRelationships);
      let syncedStory = markSynced();
      const remainingWork={...syncedStory.memoryArchiveWork};
      if(!reviewFailures.length)delete remainingWork[character.id];
      syncedStory={...syncedStory,memoryArchiveWork:remainingWork,
        memorySyncReport:{retained:retainedCount,review:reviewCount-failedIds.size,skipped:result.valueSkippedCount||0,failed:failedIds.size},
        memorySyncOutcome:reviewCount?"review":"retained"};
      if(reviewFailures.length){
        const revisions={...syncedStory.syncedSourceMessageRevisions};failedSourceIds.forEach(id=>delete revisions[id]);
        syncedStory={...syncedStory,syncedSourceMessageRevisions:revisions,syncedSourceMessageIds:Object.keys(revisions),memorySyncStatus:"partial",
          lastMemorySyncError:[...new Set(reviewFailures.map(failure=>describeMemoryReviewFailure(failure.code)))].join("?")};
      }
      await persistSynced(syncedStory);
      if (options.userConfirmed&&!options.backgroundProgress&&!reviewFailures.length) captureOfflineStoryCompletedEvent({ story: syncedStory, userIdentityId: relationships.find((relation) => relation.id === syncedStory.relationId)?.userIdentityId, sourceMessages, userConfirmed: true, confirmedFacts, recordedAt: now });
      notifyOfflineMemorySync({message:reviewFailures.length
        ?`已归档 ${retainedCount} 条；${failedIds.size} 条整理未完成：${syncedStory.lastMemorySyncError}。再次同步只补做未完成步骤。`
        :"线下剧情摘要已同步到当前角色"});
      return syncedStory;
    } catch (error) {
      console.error("Failed to sync offline story memories:", error);
      const errorMessage = error instanceof Error ? error.message : String(error || "未知同步错误");
      let failureBase:OfflineStory;
      try{failureBase=currentStory();}catch{
        notifyOfflineMemorySync({message:`线下剧情记忆未提交：${errorMessage}`,isError:true});
        return {...story,memorySyncStatus:"failed",lastMemorySyncError:errorMessage};
      }
      const failedStory: OfflineStory = { ...failureBase, memorySyncStatus: "failed", lastMemorySyncError: errorMessage, updatedAt: Date.now() };
      const failureSaved=await onSaveOfflineStory(failedStory);
      if (failureSaved && activeStoryRef.current?.id === story.id) saveActiveStorySnapshot(failedStory);
      notifyOfflineMemorySync({ message: `线下剧情记忆同步失败：${errorMessage}。故事已保留，可稍后重试`, isError: true });
      return failedStory;
    } finally {
      memorySyncInFlightRef.current.delete(story.id);
      setMemorySyncingStoryId((current) => current === story.id ? null : current);
    }
  };
  const handleSyncMemoryToBrain=(story:OfflineStory,options:OfflineArchiveOptions={})=>enqueueOfflineArchive(story,options,async(initial,requestOptions)=>{
    if(requestOptions?.syncIntent==="manual_settings"&&needsOfflineMemoryRepair(initial)){
      memorySyncInFlightRef.current.add(initial.id);setMemorySyncingStoryId(initial.id);
      try{
        const resolved=resolveOfflineMemoryRepairScope(initial,characters,relationships,activeIdentityId);
        const normalizeLive=(story:OfflineStory)=>resolveOfflineMemoryRepairScope(story,characters,relationships,activeIdentityId).story;
        const synced=await rebuildOfflineStoryMemory({story:resolved.story,participants:resolved.participants,settings:globalSettings,reviewRequest:requestMemoryReview,
          readLive:()=>{
            if(hasOfflineArchiveReader()){
              const live=readOfflineArchiveStory(initial.id);if(!live)throw Error("剧情已删除，未提交修复结果");
              return normalizeLive(activeStoryRef.current?.id===initial.id&&activeStoryRef.current.updatedAt>live.updatedAt?activeStoryRef.current:live);
            }
            if(activeStoryRef.current?.id===initial.id)return normalizeLive(activeStoryRef.current);
            const read=loadOfflineStories([]),live=read.value.find(s=>s.id===initial.id);
            if(!read.valid||!live)throw Error("剧情来源不可用，未提交修复结果");return normalizeLive(live);
          },
          persist:async updated=>{const saved=await onSaveOfflineStory(updated);if(saved&&activeStoryRef.current?.id===initial.id)saveActiveStorySnapshot(updated);return Boolean(saved);},
          progress:message=>notifyOfflineMemorySync({message})});
        notifyOfflineMemorySync({message:"完整剧情记忆已修复并同步，对应旧摘要已停止重复召回"});return synced;
      }catch(error){const message=error instanceof Error?error.message:"修复未完成";notifyOfflineMemorySync({message:`${message}。旧记忆继续保留，手动同步可接续处理。`,isError:true});return readOfflineArchiveStory(initial.id)||activeStoryRef.current||initial;}
      finally{memorySyncInFlightRef.current.delete(initial.id);setMemorySyncingStoryId(id=>id===initial.id?null:id);}
    }
    if(initial.memoryRepair){showToast("剧情记忆修复尚未完成，请在剧本设置中手动继续；旧记忆仍可调用");return initial;}
    let current=initial;
    for(;;){
      const before=getOfflineMemorySourceMessages(current).map(message=>message.id+offlineMemorySourceRevision(message)).join("|");
      const result=await runBatch(current,requestOptions);
      const remaining=getOfflineMemorySourceMessages(result).map(message=>message.id+offlineMemorySourceRevision(message)).join("|");
      if((result.memorySyncStatus==="failed"||result.memorySyncStatus==="partial")||!remaining||remaining===before)return result;
      current=result;
      requestOptions={...requestOptions,incrementalOnly:true};
    }
  });

  return { handleSyncMemoryToBrain };
}

export const useOfflineStoryMemorySyncActions=createOfflineStoryMemorySyncActions;
