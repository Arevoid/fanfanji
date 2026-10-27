import {readMemorySystem,MEMORY_SYSTEM_KEY} from "../../../core/storage/repositories/memorySystemRepository";
import {loadKnowledgeClaims} from "../../../core/storage/repositories/characterKnowledgeRepository";
import {replaceMemoryStores} from "../../../core/storage/memoryStoreTransaction";
import {readJson,writeJson} from "../../../core/storage/storageAdapter";
import {storageKeys} from "../../../core/storage/storageKeys";
import {preserveUnreplacedLegacySources} from "../../../domain/characterKnowledge/knowledgeOrganization";
import {readMemoryMigrationCoverage} from "./memoryMigrationCoverage";
import {isMemoryOrganizationFailure,memoryOrganizationFailureText,type MemoryOrganizationFailure} from "./memoryOrganizationFailure";
export const MEMORY_MIGRATION_FINISHED_NOTICE="旧记忆处理已结束，原有内容继续兼容调用。历史记录不足以证明模型整理成功，本次未重新请求模型。";
export function memoryMigrationNoticeText(){
 const result=readMemorySystem().value.migrationResult;
 if(!result)return MEMORY_MIGRATION_FINISHED_NOTICE;
 const counts=`本次新整理 ${result.newlyOrganized} 条，历史已有整理结果 ${result.organizedBefore} 条；保留旧方式调用 ${result.preserved} 条。`;
 const title=result.status==="interrupted"?"上次整理已中断。":result.status==="unknown"?"本次整理结果无法完整核实。":result.status==="failed"?"本次未能完成整理。":result.status==="partial"?"本次整理部分完成。":!result.total?"没有可整理的旧记忆。":result.newlyOrganized?"旧记忆整理完成。":result.organized?"旧记忆已有整理结果，无需重复整理。":"旧记忆已失效或被更新，无需重新整理。";
 return title+counts+(isMemoryOrganizationFailure(result.failure)?`原因：${memoryOrganizationFailureText(result.failure)}。`:"")
  +(result.missing||result.orphans?`另有 ${result.missing} 条来源无法核实、${result.orphans} 项归属待确认，不能算作整理成功。`:"")
  +(result.inactive?`已失效或被更新 ${result.inactive} 条，未重新启用。`:"")
  +"新记忆继续使用新系统，不会自动重试或再次提示迁移。";
}
/** Finishing means every remaining source is preserved, not that every API succeeded. */
export function finalizeMemoryMigration(input:{organizedBefore?:readonly string[];failure?:MemoryOrganizationFailure;interrupted?:boolean;unknown?:boolean}={}){
 const system=readMemorySystem(),claims=loadKnowledgeClaims();
 const snapshot=readJson<{claims?:{id:string}[]}>("phone_memory_continuity_legacy_snapshot_v1",{});
 if(!system.valid||system.value.choice!=="accepted"||!claims.valid||!snapshot.valid
   ||snapshot.value.claims!==undefined&&!Array.isArray(snapshot.value.claims))return {success:false};
 if(system.value.migrationFinished)return {success:true};
 const ids=new Set((snapshot.value.claims||[]).filter(c=>c&&typeof c.id==="string").map(c=>c.id));
 const records=preserveUnreplacedLegacySources(claims.value,ids);
 const coverage=readMemoryMigrationCoverage();
 const progress=readJson<{orphanIds?:string[]}>("phone_memory_continuity_migration_v1",{});
 const organizedIds=coverage.organizedSourceIds||[];
 const before=new Set(input.organizedBefore||organizedIds);
 const organizedBefore=organizedIds.filter(id=>before.has(id)).length;
 const newlyOrganized=organizedIds.filter(id=>!before.has(id)).length;
 const preserved=Math.max(0,coverage.total-coverage.organized-coverage.inactive-coverage.missing);
 const orphans=Array.isArray(progress.value?.orphanIds)?progress.value.orphanIds.length:0;
 const result={status:input.interrupted?"interrupted" as const:input.unknown||!coverage.valid||!snapshot.found?"unknown" as const:
  input.failure||preserved||coverage.missing||orphans?coverage.organized?"partial" as const:"failed" as const:"completed" as const,
  total:coverage.total,organizedBefore,newlyOrganized,organized:coverage.organized,preserved,inactive:coverage.inactive,missing:coverage.missing,orphans,...(system.value.migrationRequests?{requests:system.value.migrationRequests}:{}),filtered:coverage.filtered,pending:coverage.pending+coverage.awaitingReview,savedBatches:coverage.savedBatches,failedBatches:coverage.failedBatches,...(input.failure?{failure:input.failure}:{})};
 const write=replaceMemoryStores({[storageKeys.characterKnowledgeClaims]:records,
  [MEMORY_SYSTEM_KEY]:{...system.value,migrationFinished:true,migrationNoticePending:true,migrationResult:result}});
 if(write.success&&typeof document!=="undefined")document.dispatchEvent(new Event("fanfanji:memory-migration-finished"));
 return write;
}
/** Consume durably before rendering so reloads and multiple views cannot repeat the notice. */
export function consumeMemoryMigrationNotice(){
 const system=readMemorySystem();
 return Boolean(system.valid&&system.value.migrationFinished&&system.value.migrationNoticePending
  &&writeJson(MEMORY_SYSTEM_KEY,{...system.value,migrationNoticePending:false}).success);
}
export function finishPreviousMemoryMigration(active:boolean){
 if(active)return false;
 const system=readMemorySystem();
 const progress=readJson<{consentAt?:number;status?:string}|undefined>("phone_memory_continuity_migration_v1",undefined);
 if(system.valid&&system.value.choice==="accepted"&&!system.value.migrationFinished&&progress.valid&&progress.value?.consentAt
  &&["running","failed","needs_review","completed"].includes(progress.value.status||""))return finalizeMemoryMigration({interrupted:true}).success;
 return false;
}
