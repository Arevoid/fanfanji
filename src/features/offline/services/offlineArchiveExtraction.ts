import type {Character,Message,OfflineStory,UserSettings} from "../../../types";
import type {CharacterTruthScope,KnowledgeClaim} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type {MemoryExtractionContext,MemoryExtractionResult,MemoryExtractionApi} from "../../../domain/memory/memoryTypes";
import type {OfflineArchiveCheckpoint} from "../../../types";
import {normalizeKnowledgeClaim} from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import {MemoryService} from "../../../domain/memory/MemoryService";
import {offlineMemorySourceRevision} from "../../../domain/memory/offlineMemorySync";
import {sourceRevision} from "../../../domain/characterKnowledge/knowledgeEvolution";
import {isExactTruthScope} from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import {loadKnowledgeClaims} from "../../../core/storage/repositories/characterKnowledgeRepository";
import {authorizedMemorySettings} from "../../characterKnowledge/services/memorySettingReviewService";
import {loadWorldBookEntries} from "../../../core/storage/repositories/worldBookRepository";
import {apiChat} from "../../../utils/apiHelper";
import {clearOfflineFailureResponse,rememberOfflineFailureResponse} from "./offlineFailureResponse";
import {selectOfflineExtractionSettings} from "../../../domain/memory/offlineExtractionSettings";

/** One extraction request per bounded window. Admission and source checks are local. */
export async function extractOfflineArchiveWithCheckpoint(input:{story:OfflineStory;character:Character;scope:CharacterTruthScope;settings:UserSettings;
 context:MemoryExtractionContext;extractApi:MemoryExtractionApi;persist:(work:OfflineArchiveCheckpoint<KnowledgeClaim>)=>Promise<void>;
 reviewRequest?:typeof apiChat;readClaims?:()=>readonly KnowledgeClaim[]}):Promise<MemoryExtractionResult>{
 const messages=input.context.recentMessages;
 const settingsRead=loadWorldBookEntries([]);if(!settingsRead.valid)throw Error("setting_store_unavailable");
 const memorySettings=selectOfflineExtractionSettings(
  authorizedMemorySettings(input.character,input.scope,"offline",settingsRead.value),messages.map(m=>m.content).join("\n"));
 const sourceRevisions=Object.fromEntries(messages.map(message=>[message.id,offlineMemorySourceRevision(message)]));
 const raw=input.story.memoryArchiveWork?.[input.character.id];
 const stored=raw&&raw.version===1&&Array.isArray(raw.candidates)&&raw.candidates.every(claim=>normalizeKnowledgeClaim(claim))
   &&Array.isArray(raw.reviewedIds)&&Array.isArray(raw.skippedIds)&&Array.isArray(raw.failures)&&raw.sourceRevisions&&typeof raw.sourceRevisions==="object"
   ?raw as OfflineArchiveCheckpoint<KnowledgeClaim>:undefined;
 const exact=stored?.version===1&&isExactTruthScope(stored.scope,input.scope)
  &&Object.keys(stored.sourceRevisions).length===messages.length
  &&messages.every(message=>stored.sourceRevisions[message.id]===sourceRevisions[message.id]);
 let work:OfflineArchiveCheckpoint<KnowledgeClaim>=exact?{...stored,candidates:[...stored.candidates],reviewedIds:[...stored.reviewedIds],skippedIds:[...stored.skippedIds],failures:[...stored.failures]}:
  {version:1,scope:input.scope,sourceRevisions,extracted:false,candidates:[],reviewedIds:[],skippedIds:[],failures:[],rejectedCandidateCount:0,valueSkippedCount:0};
 const sourceById=new Map(messages.map(message=>[message.id,message]));
 const validCandidate=(claim:KnowledgeClaim)=>isExactTruthScope(claim,input.scope)&&claim.source.storyId===input.story.id&&claim.status==="active"
  &&Boolean(claim.source.messageIds?.length)&&claim.source.messageIds!.every(id=>{
    const source=sourceById.get(id);return source&&claim.source.messageRevisions?.[id]===sourceRevision(source.content);
  })&&messages.some(message=>message.content.includes(claim.source.evidenceQuote||claim.statement));
 if(exact&&work.candidates.some(claim=>!validCandidate(claim)))throw Error("offline_archive_checkpoint_source_changed");
 if(!work.extracted){
  clearOfflineFailureResponse(input.story);
  let logicalRequests=0;
  // Old failure paths saved candidates but no cursor. Reuse only evidence-bearing,
  // unchanged sources, leaving messages without verifiable coverage to extraction.
  const recovered=work.candidates.length?work.candidates:(input.readClaims?.()||loadKnowledgeClaims().value).filter(validCandidate);
  const covered=new Set(recovered.flatMap(claim=>claim.source.messageIds||[]));
  const missing=messages.filter(message=>!covered.has(message.id));
  const result=missing.length?await MemoryService.extractMemoryBatches({...input.context,singlePass:true,memorySettings,recentMessages:missing,reviewAuthorizedSettings:undefined,
    onFailedResponse:response=>rememberOfflineFailureResponse(input.story,response,logicalRequests)},params=>{logicalRequests++;return input.extractApi(params);}):
    {acceptedClaims:[],extractedMemories:[],rejectedCandidateCount:0} as MemoryExtractionResult;
  if(result.apiError)return result;
  work={...work,extracted:true,impressionCandidates:result.impressionCandidates,candidates:[...new Map([...recovered,...result.acceptedClaims].map(claim=>[claim.id,{...claim,offlineArchiveManaged:true}])).values()],
    rejectedCandidateCount:result.rejectedCandidateCount,valueSkippedCount:result.valueSkippedCount||0};
  await input.persist(work);
 }
 // Prior checkpoints may contain an unfinished independent review. Do not
 // call it again, and do not promote its uncertain candidates to facts.
 work={...work,reviewedIds:work.candidates.map(c=>c.id),failures:[]};
 await input.persist(work);
 const skipped=new Set(work.skippedIds);
 return {acceptedClaims:work.candidates.filter(claim=>!skipped.has(claim.id)),discardedClaims:work.candidates.filter(claim=>skipped.has(claim.id)).map(claim=>({...claim,admissionStatus:"skipped" as const,coreCandidate:false})),extractedMemories:[],
  impressionCandidates:work.impressionCandidates,
  rejectedCandidateCount:work.rejectedCandidateCount+work.skippedIds.length,valueSkippedCount:work.valueSkippedCount,reviewFailures:work.failures};
}
