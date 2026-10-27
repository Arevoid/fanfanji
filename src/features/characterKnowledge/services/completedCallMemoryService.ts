import { resolveCharacterTextSettings } from "../../../domain/character/characterTextApiRouting";
import type {Character,MemoryVaultSettings,UserSettings} from "../../../types";
import type {CharacterRelationship} from "../../../domain/relationship/characterRelationship";
import type {MemoryExtractionApi} from "../../../domain/memory/memoryTypes";
import {MemoryService} from "../../../domain/memory/MemoryService";
import {commitMemoryWriteBundle} from "../../../domain/memory/memoryWriteCoordinator";
import {loadCommittedMessages} from "../../../core/storage/repositories/messageRepository";
import {loadKnowledgeClaims,appendMany} from "../../../core/storage/repositories/characterKnowledgeRepository";
import {conversationSummaryRepository} from "../../../core/storage/repositories/conversationSummaryRepository";
import {canWriteMemoryStorage} from "../../../core/storage/memoryWriterCoordination";
import {storageKeys} from "../../../core/storage/storageKeys";
import {isCallRecordMarkup,parseCallRecord} from "../../chat/services/messageParser";
import {apiExtractMemoriesWithModelFallback} from "../../../utils/apiHelper";
import {createId} from "../../../core/id/createId";
import {beginMemoryExtractionTask,finishMemoryExtractionTask,isMemoryExtractionTaskPending,memoryExtractionSourcesStillCurrent} from "./memoryExtractionTaskService";
import {createConversationSummaryRecord} from "./conversationSummaryService";
import {createMemorySettingReviewer} from "./memorySettingReviewService";
import {prepareMemoryIdentityRegistry} from "./memoryIdentityRegistryService";

/** Foreground app worker; independent of the currently open chat screen. One
 * saved call per tick, with the same durable source leases as chat extraction. */
export async function archivePendingCompletedCall(input:{characters:readonly Character[];relationships:readonly CharacterRelationship[];settings:UserSettings;recallSettings?:MemoryVaultSettings;extractApi?:MemoryExtractionApi;visible?:boolean;now?:number;notBefore?:number}){
 const now=input.now??Date.now();
 if(input.visible===false||!canWriteMemoryStorage(storageKeys.characterKnowledgeClaims))return "ineligible";
 const saved=await loadCommittedMessages();if(!saved.valid)return "failed";
 for(const message of saved.value){
  if(input.notBefore!==undefined&&message.timestamp<input.notBefore)continue;
  if(message.recalledAt||!isCallRecordMarkup(message.content))continue;
  const call=parseCallRecord(message.content);if(call.status!=="completed"||!call.transcript.some(turn=>turn.content?.trim()))continue;
  const relation=input.relationships.find(relation=>relation.characterId===message.characterId&&relation.id===message.relationId&&relation.conversationId===message.conversationId);
  const character=input.characters.find(character=>character.id===relation?.characterId&&!character.isGroupChat&&!character.isContactInstance);
  if(!relation||!character)continue;
  input = {...input,settings:resolveCharacterTextSettings(input.settings,character)};
  const scope={characterId:character.id,relationId:relation.id,userIdentityId:relation.userIdentityId,conversationId:relation.conversationId};
  if(!scope.conversationId||!isMemoryExtractionTaskPending(scope,[message],now))continue;
  const task=beginMemoryExtractionTask(scope,[message],now);if(!task)continue;
  let completed=false;
  try{
   const model=input.settings.selectedModel;
   const result=await MemoryService.extractMemories({...scope,requireFactResolution:true,character,recentMessages:[message],existingClaims:loadKnowledgeClaims().value,existingMemories:[],scenario:"chat",
    prepareSemanticRegistry:query=>prepareMemoryIdentityRegistry(scope,input.settings,query),reviewAuthorizedSettings:createMemorySettingReviewer(character,scope,"chat",{...input.settings,selectedModel:model}),
    apiKey:input.settings.apiKey,apiEndpoint:input.settings.apiEndpoint,model:model||"gemini-3.5-flash",createId:()=>createId("call-memory"),currentTime:()=>now,formatContent:items=>items.join("\n")},input.extractApi||((params)=>apiExtractMemoriesWithModelFallback(params,input.settings.selectedModel)));
   if(result.apiError||!memoryExtractionSourcesStillCurrent(task)||result.rejectedCandidateCount>(result.valueSkippedCount||0))throw Error("call_archive_not_ready");
   const summary=createConversationSummaryRecord({id:`call-summary:${message.id}`,scope,claims:result.acceptedClaims,sourceMessageIds:[message.id],generatedAt:now,generator:"completed-call.v1",layer:"episode"});
   if(result.acceptedClaims.length){
    const write=await commitMemoryWriteBundle({claims:result.acceptedClaims,...(summary?{summary}:{}),appendClaims:appendMany,appendSummaries:rows=>conversationSummaryRepository.appendMany(rows)});
    if(!write.canonicalWritten||summary&&!write.summaryWritten)throw Error("call_archive_write_failed");
   }
   completed=finishMemoryExtractionTask(task,"completed");
   return completed?"completed":"failed";
  }catch{return "failed";}
  finally{if(!completed)finishMemoryExtractionTask(task,"failed");}
 }
 return "idle";
}
