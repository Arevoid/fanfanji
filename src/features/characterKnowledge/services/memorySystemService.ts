import type {Character} from "../../../types";
import type {CharacterRelationship} from "../../../domain/relationship/characterRelationship";
import {readMemorySystem,MEMORY_SYSTEM_KEY} from "../../../core/storage/repositories/memorySystemRepository";
export {readMemorySystem,type MemorySystemState} from "../../../core/storage/repositories/memorySystemRepository";
import {loadKnowledgeClaims} from "../../../core/storage/repositories/characterKnowledgeRepository";
import {loadMemories} from "../../../core/storage/repositories/memoryRepository";
import {loadConversationSummaries} from "../../../core/storage/repositories/conversationSummaryRepository";
import {loadBehaviorCorrections} from "../../../core/storage/repositories/behaviorCorrectionRepository";
import {replaceMemoryStores} from "../../../core/storage/memoryStoreTransaction";
import {storageKeys} from "../../../core/storage/storageKeys";
import {migrateLegacyCharacterKnowledge} from "./legacyCharacterKnowledgeMigration";
import {preserveUnreplacedLegacySources} from "../../../domain/characterKnowledge/knowledgeOrganization";
import {readJson} from "../../../core/storage/storageAdapter";
/** Local compatibility adapter only: keeps original stores, no model, no consent implied. */
export function ensureMemorySystemReady(characters:Character[]=[],relationships:CharacterRelationship[]=[]){
 const state=readMemorySystem(),claims=loadKnowledgeClaims(),legacy=loadMemories([]),summaries=loadConversationSummaries(),corrections=loadBehaviorCorrections();
 if(!state.valid||!claims.valid||!legacy.valid||!summaries.valid||!corrections.valid)return {success:false};
 const projection=migrateLegacyCharacterKnowledge({characters,relationships,memories:legacy.value,existingClaims:claims.value,existingSummaries:summaries.value,existingCorrections:corrections.value,now:Date.now()});
 const snapshot=readJson<{claims?:{id:string}[]}>("phone_memory_continuity_legacy_snapshot_v1",{});
 if(!snapshot.valid||snapshot.value.claims!==undefined&&!Array.isArray(snapshot.value.claims))return {success:false};
 const legacySourceIds=new Set((snapshot.value.claims||[]).filter(c=>c&&typeof c.id==="string").map(c=>c.id));
 const preserved=preserveUnreplacedLegacySources(claims.value,legacySourceIds);
 if(state.found&&!projection.claims.length&&!projection.summaries.length&&!projection.corrections.length&&JSON.stringify(preserved)===JSON.stringify(claims.value))return {success:true};
 const originals=state.found?claims.value:claims.value.map(claim=>({...claim,legacyCompatible:claim.status==="active"&&!claim.organizationOriginal&&claim.admissionStatus!=="skipped"&&(!claim.admissionStatus||!claim.valueAssessment&&claim.valueReason?.startsWith("价值尚未核实"))}));
 const records=preserveUnreplacedLegacySources([...originals,...projection.claims.map(claim=>({...claim,legacyCompatible:true}))],legacySourceIds);
 return replaceMemoryStores({[MEMORY_SYSTEM_KEY]:{...state.value,version:1,choice:state.found?state.value.choice:"pending",hasLegacy:state.value.hasLegacy||!state.found&&records.length>0||legacy.value.length>0||summaries.value.length>0},[storageKeys.characterKnowledgeClaims]:records,[storageKeys.conversationSummaries]:[...summaries.value,...projection.summaries],[storageKeys.behaviorCorrections]:[...corrections.value,...projection.corrections]});
}
