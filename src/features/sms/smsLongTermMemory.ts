import { resolveCharacterTextSettings } from "../../domain/character/characterTextApiRouting";
import type { Character, Message, UserSettings } from "../../types";
import type { SmsMessage, SmsStore, SmsTimeline, SmsTimelineMemory } from "../../domain/sms/smsTypes";
import { sourceRevision, evolveKnowledgeClaims } from "../../domain/characterKnowledge/knowledgeEvolution";
import { isExactTruthScope } from "../../domain/characterKnowledge/knowledgeConflictPolicy";
import { MemoryService } from "../../domain/memory/MemoryService";
import type { MemoryExtractionApi } from "../../domain/memory/memoryTypes";
import type { MemoryExtractionContext } from "../../domain/memory/memoryTypes";
import { getChatArchiveRoundLimit, requestsPriorityMemory, splitChatArchiveTurnBatches, splitCompletedChatTurns } from "../../domain/memory/chatArchiveTurns";
import { apiExtractMemoriesWithModelFallback } from "../../utils/apiHelper";
import { createMemorySettingReviewer } from "../characterKnowledge/services/memorySettingReviewService";
import { contributeSemanticDirectReplyTruthContext } from "../characterKnowledge/services/semanticMemoryRecallService";
import { formatTruthRetrievalForPrompt } from "../characterKnowledge/services/truthRetrievalService";
import { createId } from "../../core/id/createId";
import {emptyCharacterContinuity} from "../../domain/memory/characterContinuity";
import {canWriteMemoryStorage} from "../../core/storage/memoryWriterCoordination";
import {storageKeys} from "../../core/storage/storageKeys";
export const canWriteSmsMemory=()=>canWriteMemoryStorage(storageKeys.smsStore);

export const smsMemoryScope = (timeline: SmsTimeline) => ({ characterId:timeline.characterId, userIdentityId:timeline.ownerIdentityId,
  relationId:`sms:${timeline.id}`, conversationId:`sms:${timeline.id}` });
/** Only an explicit convert-current action can rebind the same SMS worldline. */
export function rebindSmsTimelineMemory(memory:SmsTimelineMemory,from:SmsTimeline,to:SmsTimeline):SmsTimelineMemory {
  if(memory.timelineId!==from.id||from.characterId!==to.characterId||from.ownerIdentityId!==to.ownerIdentityId||from.phoneNumber!==to.phoneNumber
    ||memory.characterId!==from.characterId||memory.ownerIdentityId!==from.ownerIdentityId||memory.phoneNumber!==from.phoneNumber)return memory;
  return {...memory,timelineId:to.id,claims:memory.claims?.filter(c=>isExactTruthScope(c,smsMemoryScope(from))).map(c=>({...c,...smsMemoryScope(to)}))};
}
const belongs = (message:SmsMessage,timeline:SmsTimeline) => message.timelineId===timeline.id && message.characterId===timeline.characterId
  && message.ownerIdentityId===timeline.ownerIdentityId && message.phoneNumber===timeline.phoneNumber;
const revision = (m:SmsMessage) => sourceRevision(JSON.stringify([m.sender,m.content,m.timelineTime,m.receivedAt]));
const scopedMemory = (store:SmsStore,t:SmsTimeline) => store.memories.find(m=>m.timelineId===t.id&&m.characterId===t.characterId&&m.ownerIdentityId===t.ownerIdentityId&&m.phoneNumber===t.phoneNumber);
export function currentSmsClaims(store:SmsStore,timeline:SmsTimeline) {
  const scope=smsMemoryScope(timeline),messages=new Map(store.messages.filter(m=>belongs(m,timeline)).map(m=>[m.id,m]));
  return (scopedMemory(store,timeline)?.claims||[]).filter(c=>isExactTruthScope(c,scope)&&c.source.messageIds?.length
    && c.source.messageIds.every(id=>messages.has(id)&&c.source.messageRevisions?.[id]===sourceRevision(messages.get(id)!.content)));
}
const running=new Set<string>();
/** Reuses the evidence/value/revision engine, with SMS-owned storage and namespace. */
export async function archiveSmsLongTermMemory(input:{timeline:SmsTimeline;character:Character;settings:UserSettings;read:()=>SmsStore;write:(store:SmsStore)=>boolean;extractApi?:MemoryExtractionApi;reviewAuthorizedSettings?:MemoryExtractionContext["reviewAuthorizedSettings"];now?:number}) {
  input = { ...input, settings: resolveCharacterTextSettings(input.settings, input.character) };
  const scope=smsMemoryScope(input.timeline),key=JSON.stringify(scope),now=input.now??Date.now();
  if(running.has(key)||!input.settings.apiKey||input.character.id!==scope.characterId||!canWriteSmsMemory())return "ineligible";
  const before=input.read(),memory=scopedMemory(before,input.timeline);
  if(memory?.extractionFailureAt&&now-memory.extractionFailureAt<300000)return "limited";
  const messages=before.messages.filter(m=>belongs(m,input.timeline)&&m.sender!=="system");
  const pending=messages.filter(m=>memory?.processedRevisions?.[m.id]!==revision(m));
  const converted=pending.map(m=>({id:m.id,...scope,sender:m.sender,content:m.content,timestamp:m.receivedAt} as Message));
  const rounds=getChatArchiveRoundLimit(input.character.summaryTriggerRound);
  if(splitCompletedChatTurns(converted).length<rounds&&!converted.some(requestsPriorityMemory))return "limited";
  const batch=splitChatArchiveTurnBatches(converted,rounds)[0];if(!batch?.length)return "limited";
  running.add(key);
  try {
    const claims=currentSmsClaims(before,input.timeline);
    const result=await MemoryService.extractMemories({...scope,requireFactResolution:true,character:input.character,recentMessages:batch,existingClaims:claims,existingMemories:[],scenario:"chat",
      reviewAuthorizedSettings:input.reviewAuthorizedSettings||createMemorySettingReviewer(input.character,scope,"chat",input.settings),apiKey:input.settings.apiKey,model:input.settings.selectedModel,apiEndpoint:input.settings.apiEndpoint,
      createId:()=>createId("sms-memory"),currentTime:()=>now,formatContent:items=>items.join("\n")},input.extractApi||((p)=>apiExtractMemoriesWithModelFallback(p,input.settings.selectedModel)));
    if(result.apiError||result.rejectedCandidateCount>(result.valueSkippedCount||0))throw Error("sms_memory_not_ready");
    const latest=input.read();
    if(!latest.timelines.some(t=>t.id===input.timeline.id && t.characterId===input.timeline.characterId
      && t.ownerIdentityId===input.timeline.ownerIdentityId && t.phoneNumber===input.timeline.phoneNumber
      && t.kind===input.timeline.kind && t.timelineTime===input.timeline.timelineTime))return "stale";
    const sources=messages.filter(m=>batch.some(b=>b.id===m.id));
    if(sources.some(m=>!latest.messages.some(current=>belongs(current,input.timeline)&&current.id===m.id&&revision(current)===revision(m))))return "stale";
    const previous=scopedMemory(latest,input.timeline);
    const next:SmsTimelineMemory={...previous,timelineId:input.timeline.id,characterId:scope.characterId,ownerIdentityId:scope.userIdentityId,phoneNumber:input.timeline.phoneNumber,notes:previous?.notes||[],
      claims:evolveKnowledgeClaims(currentSmsClaims(latest,input.timeline),result.acceptedClaims.map(c=>({...c,source:{...c.source,messageRevisions:Object.fromEntries((c.source.messageIds||[]).map(id=>[id,sourceRevision(sources.find(m=>m.id===id)?.content||"")]))}}))),
      processedRevisions:{...previous?.processedRevisions,...Object.fromEntries(sources.map(m=>[m.id,revision(m)]))},extractionFailureAt:undefined,updatedAt:now};
    return input.write({...latest,memories:[...latest.memories.filter(m=>m!==previous),next]})?"completed":"failed";
  } catch {
    const latest=input.read(),previous=scopedMemory(latest,input.timeline);
    const failed:SmsTimelineMemory={...previous,timelineId:input.timeline.id,characterId:scope.characterId,ownerIdentityId:scope.userIdentityId,phoneNumber:input.timeline.phoneNumber,notes:previous?.notes||[],updatedAt:now,extractionFailureAt:now};
    input.write({...latest,memories:[...latest.memories.filter(m=>m!==previous),failed]});return "failed";
  } finally {running.delete(key);}
}
export async function recallSmsLongTermMemory(input:{timeline:SmsTimeline;settings:UserSettings;query:string;read:()=>SmsStore}) {
  const readClaims=()=>currentSmsClaims(input.read(),input.timeline);
  const result=await contributeSemanticDirectReplyTruthContext({configuration:input.settings.memoryEmbedding,readClaims,retrieval:{scope:smsMemoryScope(input.timeline),queryText:input.query,claims:readClaims(),summaries:[],corrections:[],continuitySnapshot:emptyCharacterContinuity(),scenario:"private",mentionChannel:`sms:${input.timeline.id}`,limit:20}});
  return formatTruthRetrievalForPrompt(result);
}
