import type {Character,UserSettings} from "../../../types";
import {initializeCharacterRepository,saveCharacters,flushCharacters} from "../../../core/storage/repositories/characterRepository";
import {initializeMessages} from "../../../core/storage/repositories/messageRepository";
import {saveSettingsAsync} from "../../../core/storage/repositories/settingsRepository";
import {saveRelationships} from "../../../core/storage/repositories/relationshipRepository";
import {saveKnowledgeClaims} from "../../../core/storage/repositories/characterKnowledgeRepository";
import {readJson,writeJson} from "../../../core/storage/storageAdapter";
import type {KnowledgeClaim} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
/** Explicit, dedicated synthetic origin; refuses an existing non-fixture profile. */
export async function prepareMemoryAcceptanceFixture(defaults:UserSettings){
 if(location.hostname!=="127.0.0.4"||location.port!=="3104")throw Error("fixture_origin_rejected");
 const marker="memory_acceptance_fixture_20261023";
 if(readJson(marker,false).value)return;
 const [characters,messages]=await Promise.all([initializeCharacterRepository([]),initializeMessages([])]);
 if(!characters.valid||!messages.valid||characters.value.length||messages.value.length)throw Error("fixture_requires_empty_origin");
 const avatar="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#dbeafe"/></svg>');
 const rows:Character[]=[{id:"memory-fixture-a",name:"验收甲",avatar,ownerIdentityId:"identity-1",personality:"合成验收",backstory:"合成资料"},{id:"memory-fixture-b",name:"验收乙",avatar,ownerIdentityId:"identity-1",personality:"合成验收",backstory:"合成资料"}];
 const relations=rows.map(character=>({id:`relation-${character.id}`,characterId:character.id,userIdentityId:"identity-1",conversationId:`conversation-${character.id}`,relationship:"friend" as const,createdAt:1,updatedAt:1}));
 const claims:KnowledgeClaim[]=relations.map((relation,i)=>({id:`claim-${i}`,characterId:relation.characterId,relationId:relation.id,userIdentityId:relation.userIdentityId,conversationId:relation.conversationId,statement:i?"只属于乙的书店约定":"你告诉甲，自己一直害怕打雷。",kind:"fact",subject:"user",truthStatus:"asserted",temporalStatus:"present",confidence:.9,userConfirmed:false,status:"active",visibility:"relation_private",recordedAt:Date.now(),schemaVersion:1,continuityVersion:1,admissionStatus:"retained",importance:8,source:{kind:"user_message",app:"chat",authorship:"user",producer:"synthetic",evidenceKey:`fixture-${i}`,messageIds:[`fixture-source-${i}`]}}));
 const settings=await saveSettingsAsync({...defaults,name:"隔离验收用户",avatar,activeIdentityId:"identity-1",identities:[{id:"identity-1",rootIdentityId:"identity-1",kind:"primary",name:"隔离验收用户",avatar,bio:"合成资料",signature:"验收"}],apiKey:"",apiEndpoint:"",apiPresets:[],memoryEmbedding:undefined});
 if(!settings.success||!saveCharacters(rows).success||!saveRelationships(relations).success||!saveKnowledgeClaims(claims).success||!(await flushCharacters()).success)throw Error("fixture_write_failed");
 writeJson(marker,true);
}
