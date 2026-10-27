import type {Character,Message,OfflineStory,UserSettings} from "../../../types";
import type {CharacterRelationship} from "../../../domain/relationship/characterRelationship";
import type {KnowledgeClaim} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {getOfflineMemorySourceMessages,offlineMemorySourceRevision,getOfflineStorySummaryId,isOfflineStoryHandoffMemory} from "../../../domain/memory/offlineMemorySync";
import {nextOfflineArchiveBatch,splitOfflineSourceText} from "../../../domain/memory/offlineArchivePolicy";
import {sourceRevision} from "../../../domain/characterKnowledge/knowledgeEvolution";
import {canSyncOfflineStoryToMemory} from "../../../domain/offlineStory/offlineStoryFactPolicy";
import {isKnowledgeAdmitted} from "../../../domain/characterKnowledge/knowledgeValueAssessment";
import {isExactTruthScope} from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import {normalizeKnowledgeClaim} from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import {resolveCharacterTextSettings} from "../../../domain/character/characterTextApiRouting";
import {createConversationSummaryRecord} from "../../characterKnowledge/services/conversationSummaryService";
import {extractOfflineArchiveWithCheckpoint} from "./offlineArchiveExtraction";
import {loadKnowledgeClaims,normalizeKnowledgeClaims} from "../../../core/storage/repositories/characterKnowledgeRepository";
import {loadConversationSummaries} from "../../../core/storage/repositories/conversationSummaryRepository";
import {loadMemories} from "../../../core/storage/repositories/memoryRepository";
import {loadOfflineStories} from "../../../core/storage/repositories/offlineRepository";
import {loadCharacterContinuity} from "../../../core/storage/repositories/characterContinuityRepository";
import {isForgottenKnowledge} from "../../../domain/memory/characterContinuity";
import {replaceMemoryStores} from "../../../core/storage/memoryStoreTransaction";
import {storageKeys} from "../../../core/storage/storageKeys";
import {apiExtractMemoriesWithModelFallback,apiChat} from "../../../utils/apiHelper";
import {createId} from "../../../core/id/createId";

export function needsOfflineMemoryRepair(story:OfflineStory){
 if(story.memoryRepair)return true;if(story.memoryArchiveVersion===3)return false;
 return Boolean(story.archivedAt||story.lastMemorySyncAt||story.lastSyncedMessageCount||story.archivedMemoryIds?.length
  ||loadMemories([]).value.some(m=>isOfflineStoryHandoffMemory(m,story))
  ||loadKnowledgeClaims().value.some(c=>c.source.storyId===story.id)
  ||loadConversationSummaries().value.some(s=>s.id.startsWith(`offline-story-summary:${story.id}:`)));
}
export function repairableOfflineMessages(story:OfflineStory){return getOfflineMemorySourceMessages(story,{includeSynced:true});}
function offlineRequestWindows(messages:readonly Message[]){
 const windows:Message[][]=[];let remaining=messages.flatMap(message=>splitOfflineSourceText(message.content).map(content=>({...message,content})));
 while(remaining.length){const batch=nextOfflineArchiveBatch(remaining);windows.push(batch);remaining=remaining.slice(batch.length);}return windows;
}
export function estimateOfflineArchiveRequests(story:OfflineStory){
 if(story.memoryRepair)return Math.max(0,story.memoryRepair.totalBatches-story.memoryRepair.nextBatch-(story.memoryRepair.checkpoint?.extracted?1:0));
 const source=needsOfflineMemoryRepair(story)?repairableOfflineMessages(story):getOfflineMemorySourceMessages(story);
 return offlineRequestWindows(source).length*Math.max(1,new Set(story.characterIds||[story.characterId]).size);
}
type Participant={character:Character;relationship:CharacterRelationship};
type Input={story:OfflineStory;participants:Participant[];settings:UserSettings;
 readLive:()=>OfflineStory;persist:(story:OfflineStory)=>Promise<boolean>;progress?:(message:string)=>void;
 extractBatch?:typeof extractOfflineArchiveWithCheckpoint;reviewRequest?:typeof apiChat;
 commit?:typeof replaceMemoryStores};

/** Staged candidates never enter canonical recall before every window succeeds. */
export async function rebuildOfflineStoryMemory(input:Input):Promise<OfflineStory>{
 if(input.story.memoryArchiveVersion===3&&!input.story.memoryRepair)return input.story;
 const messages=repairableOfflineMessages(input.story);
 if(!messages.length)throw Error("原始线下剧情不可用，旧记忆保持不变");
 if(!input.participants.length)throw Error("剧情角色关系范围不完整，旧记忆保持不变");
 const scopes=input.participants.map(({character,relationship:r})=>({characterId:character.id,relationId:r.id,userIdentityId:r.userIdentityId,conversationId:r.conversationId}));
 const allowed=new Set(input.story.characterIds?.length?input.story.characterIds:[input.story.characterId]);
 if(scopes.some(s=>!allowed.has(s.characterId))||!canSyncOfflineStoryToMemory({story:input.story,userConfirmed:true,syncIntent:"manual_settings",sourceMessages:messages,participantRelationIds:scopes.map(s=>s.relationId)}))throw Error("当前剧情缺少可核对的参与或关系来源，旧记忆保持不变");
 if(scopes.some((scope,i)=>scope.characterId!==input.participants[i].relationship.characterId||scope.userIdentityId!==input.story.ownerIdentityId
   ||input.story.relationId&&(scope.relationId!==input.story.relationId||scope.conversationId!==input.story.conversationId)))throw Error("剧情身份或关系范围不匹配");
 const scopeKey=JSON.stringify(scopes),revisions=Object.fromEntries(messages.map(m=>[m.id,offlineMemorySourceRevision(m)]));
 const originals=new Map(messages.map(message=>[message.id,message]));
 const windows=offlineRequestWindows(messages);
 const jobs=input.participants.flatMap((participant,index)=>windows.map(window=>({participant,scope:scopes[index],window})));
 const prior=input.story.memoryRepair;
 const valid=prior?.version===1&&prior.scopeKey===scopeKey&&JSON.stringify(prior.sourceRevisions)===JSON.stringify(revisions)
  &&prior.totalBatches===jobs.length&&Number.isInteger(prior.nextBatch)&&prior.nextBatch>=0&&prior.nextBatch<=jobs.length
  &&Array.isArray(prior.stagedClaims)&&prior.stagedClaims.every(c=>normalizeKnowledgeClaim(c));
 let work:NonNullable<OfflineStory["memoryRepair"]>=valid?{...prior,status:"running"}:
  {version:1,scopeKey,sourceRevisions:revisions,nextBatch:0,totalBatches:jobs.length,stagedClaims:[],status:"running"};
 const lease=()=>{const live=input.readLive();if(live.id!==input.story.id||live.characterId!==input.story.characterId||live.relationId!==input.story.relationId
   ||live.ownerIdentityId!==input.story.ownerIdentityId||live.conversationId!==input.story.conversationId
   ||JSON.stringify(Object.fromEntries(repairableOfflineMessages(live).map(m=>[m.id,offlineMemorySourceRevision(m)])))!==JSON.stringify(revisions))throw Error("剧情来源已变化，本次未切换旧记忆；请重新同步");return live;};
 const save=async()=>{const live=lease();if(!await input.persist({...live,memoryRepair:work,updatedAt:Date.now()}))throw Error("修复进度保存失败，旧记忆保持不变");};
 try{
  await save();
  while(work.nextBatch<jobs.length){
   const {participant:{character,relationship},scope,window}=jobs[work.nextBatch];
   input.progress?.(`正在修复剧情记忆：${work.nextBatch}/${jobs.length} 批已完成，旧记忆仍可调用`);
   const settings=resolveCharacterTextSettings(input.settings,character);
   const result=await (input.extractBatch||extractOfflineArchiveWithCheckpoint)({story:{...lease(),memoryArchiveWork:work.checkpoint?{[character.id]:work.checkpoint}:{}},character,scope,settings,
    reviewRequest:input.reviewRequest,readClaims:()=>[],persist:async checkpoint=>{work={...work,checkpoint};await save();},
    context:{character,characterId:scope.characterId,relationId:scope.relationId,userIdentityId:scope.userIdentityId,conversationId:scope.conversationId,
     recentMessages:window,existingMemories:[],existingClaims:[],scenario:"offline",apiKey:settings.apiKey,model:settings.selectedModel||"gemini-3.5-flash",
     streamCompatible:settings.streamCompatible,apiEndpoint:settings.apiEndpoint,templateType:character.archiveTemplateType,
     offlineStoryPolicyInput:{story:input.story,userConfirmed:true,syncIntent:"manual_settings",sourceMessages:messages,participantRelationIds:scopes.map(s=>s.relationId)},
     createId:()=>createId("offline-repair"),currentTime:()=>Date.now(),formatContent:items=>items.join("\n")},
    extractApi:params=>apiExtractMemoriesWithModelFallback(params,settings.selectedModel)});
   lease();
   if(result.apiError||result.reviewFailures?.length)throw Error(result.apiError||"部分记忆整理未完成，已保存进度");
   if(result.acceptedClaims.some(c=>!isExactTruthScope(c,scope)||c.source.storyId!==input.story.id))throw Error("提取结果关系范围不匹配，未切换旧记忆");
   if(!result.acceptedClaims.length&&!result.valueSkippedCount)throw Error("本批没有可验证的结果，旧记忆保持不变");
   const rebased=result.acceptedClaims.map(claim=>({...claim,source:{...claim.source,messageRevisions:Object.fromEntries((claim.source.messageIds||[]).map(id=>[id,sourceRevision(originals.get(id)?.content||"")]))}}));
   work={...work,nextBatch:work.nextBatch+1,checkpoint:undefined,stagedClaims:[...work.stagedClaims,...rebased]};await save();
  }
  const live=lease(),claims=loadKnowledgeClaims(),summaries=loadConversationSummaries(),memories=loadMemories([]),stories=loadOfflineStories([]),continuity=loadCharacterContinuity();
  if(!claims.valid||!summaries.valid||!memories.valid||!stories.valid||!continuity.valid)throw Error("无法核对现有存储，旧记忆保持不变");
  const oldMemoryIds=new Set(memories.value.filter(m=>scopes.some(s=>m.characterId===s.characterId&&m.relationId===s.relationId&&(!m.userIdentityId||m.userIdentityId===s.userIdentityId))
    &&(isOfflineStoryHandoffMemory(m,input.story)||input.story.archivedMemoryIds?.includes(m.id))).map(m=>m.id));
  const replaced=new Set(claims.value.filter(c=>scopes.some(s=>isExactTruthScope(c,s))&&!c.intervention&&c.source.kind!=="manual"
   &&(c.source.storyId===input.story.id||!c.source.storyId&&c.source.sourceRecordId&&oldMemoryIds.has(c.source.sourceRecordId))).map(c=>c.id));
  const paused=claims.value.filter(c=>replaced.has(c.id)&&c.recallDisabled);
  if((work.stagedClaims as KnowledgeClaim[]).some(c=>!scopes.some(s=>isExactTruthScope(c,s))||c.source.storyId!==input.story.id||!c.source.messageIds?.length
   ||c.source.messageIds.some(id=>!originals.has(id)||c.source.messageRevisions?.[id]!==sourceRevision(originals.get(id)!.content))
   ||!c.source.evidenceQuote||!messages.some(m=>m.content.includes(c.source.evidenceQuote!))))throw Error("暂存结果无法核对原文，未切换旧记忆");
  const staged=(work.stagedClaims as KnowledgeClaim[]).filter(c=>!isForgottenKnowledge(c,continuity.value.forgotten)
   &&!paused.some(p=>isExactTruthScope(p,c)&&(p.statement===c.statement||p.source.messageIds?.some(id=>c.source.messageIds?.includes(id))))
   &&!memories.value.some(m=>oldMemoryIds.has(m.id)&&m.recallDisabled&&m.characterId===c.characterId&&m.relationId===c.relationId));
  const usable=staged.filter(c=>isKnowledgeAdmitted(c)&&!c.legacyCompatible&&c.status==="active");
  if(!usable.length)console.info("offline-repair-eligibility",JSON.stringify({extracted:work.stagedClaims.length,afterUserControls:staged.length,
    explicitRetained:staged.filter(c=>c.admissionStatus==="retained").length,implicitAdmitted:staged.filter(c=>c.admissionStatus===undefined).length,
    review:staged.filter(c=>c.admissionStatus==="review").length,pausedClaims:paused.length,
    disabledLegacySources:memories.value.filter(m=>oldMemoryIds.has(m.id)&&m.recallDisabled).length}));
  if(!usable.length)throw Error("没有可接替旧摘要的有效记忆，旧记忆保持不变");
  const now=Date.now();
  const records=normalizeKnowledgeClaims([...claims.value.map(c=>replaced.has(c.id)?{...c,status:"retracted" as const,truthStatus:"retracted" as const,legacyCompatible:false,retractionReason:"offline_full_source_rebuilt"}:c),...staged]);
  const newSummaries=scopes.map(scope=>{
   const candidates=records.filter(c=>isExactTruthScope(c,scope)&&c.status==="active"&&c.source.storyId===input.story.id&&isKnowledgeAdmitted(c)&&!c.legacyCompatible);
   if(!candidates.length)throw Error("部分角色没有有效接替结果，旧记忆保持不变");
   const summary=createConversationSummaryRecord({id:getOfflineStorySummaryId(input.story,scope.characterId),scope,claims:candidates,
    sourceMessageIds:Object.keys(revisions),sourceMessageRevisions:Object.fromEntries(Object.entries(revisions).filter(([id])=>!staged.some(c=>isExactTruthScope(c,scope)&&c.admissionStatus==="review"&&c.source.messageIds?.includes(id)))),generatedAt:now,layer:"episode",generator:"offline-story.full-source.v3"});
   if(!summary)throw Error("完整摘要生成失败，旧记忆保持不变");return summary;
  });
  const complete:OfflineStory={...live,memoryArchiveVersion:3,memoryRepair:undefined,memoryArchiveWork:{},memorySyncStatus:"synced",lastMemorySyncError:undefined,
   syncedSourceMessageRevisions:revisions,syncedSourceMessageIds:Object.keys(revisions),lastSyncedMessageCount:live.messages.length,lastMemorySyncAt:now,archivedAt:live.archivedAt??now,
   memorySyncReport:{retained:usable.length,review:staged.length-usable.length,skipped:0,failed:0},memorySyncOutcome:"retained",updatedAt:now};
  lease();
  const write=(input.commit||replaceMemoryStores)({[storageKeys.characterKnowledgeClaims]:records,
   [storageKeys.conversationSummaries]:[...summaries.value.filter(s=>!newSummaries.some(n=>n.id===s.id)).map(s=>scopes.some(scope=>isExactTruthScope(s,scope))&&s.sourceClaimIds.some(id=>replaced.has(id))?{...s,status:"stale" as const}:s),...newSummaries],
   [storageKeys.memoryVaultItems]:memories.value.map(m=>oldMemoryIds.has(m.id)?{...m,recallDisabled:true}:m),
   [storageKeys.offlineStories]:[...stories.value.filter(s=>s.id!==complete.id),complete]});
  if(!write.success)throw Error("记忆接替保存失败，旧记忆保持不变");
  await input.persist(complete);return complete;
 }catch(error){
  work={...work,status:"failed"};
  // Never overwrite edited/deleted sources while preserving a failed checkpoint.
  try{const live=lease();await input.persist({...live,memoryRepair:work,memorySyncStatus:"failed",lastMemorySyncError:error instanceof Error?error.message:"修复未完成",updatedAt:Date.now()});}catch{}
  throw error;
 }
}
