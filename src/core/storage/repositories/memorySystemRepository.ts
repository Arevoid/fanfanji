import {readJson,writeJson} from "../storageAdapter";
export const MEMORY_SYSTEM_KEY="phone_memory_system_v1";
export type MemoryMigrationChoice="pending"|"declined"|"accepted";
export interface MigrationRequestStats {runId:string;attempted:number;succeeded:number;failed:number}
export interface MemoryMigrationResult {
 status: "completed"|"partial"|"failed"|"interrupted"|"unknown";
 total:number;organizedBefore:number;newlyOrganized:number;organized:number;preserved:number;inactive:number;missing:number;orphans:number;
 filtered?:number;pending?:number;savedBatches?:number;failedBatches?:number;
 requests?:MigrationRequestStats;
 failure?: {code:string;httpStatus?:number};
}
export interface MemorySystemState {version:1;choice:MemoryMigrationChoice;hasLegacy:boolean;legacyOfflineReminderDismissed?:boolean;migrationFinished?:boolean;migrationNoticePending?:boolean;migrationResult?:MemoryMigrationResult;migrationRequests?:MigrationRequestStats}
function validRequests(value:unknown):boolean {const v=value as MigrationRequestStats;return Boolean(v&&typeof v.runId==="string"&&v.runId&&[v.attempted,v.succeeded,v.failed].every(n=>Number.isInteger(n)&&n>=0)&&v.succeeded+v.failed<=v.attempted);}
function validResult(value:unknown):boolean {
 if(!value||typeof value!=="object")return false;
 const result=value as MemoryMigrationResult;
 return ["completed","partial","failed","interrupted","unknown"].includes(result.status)
  && [result.total,result.organizedBefore,result.newlyOrganized,result.organized,result.preserved,result.inactive,result.missing,result.orphans].every(n=>Number.isInteger(n)&&n>=0)
  && [result.filtered,result.pending,result.savedBatches,result.failedBatches].every(n=>n===undefined||Number.isInteger(n)&&n>=0)
  && (result.requests===undefined||validRequests(result.requests))
  && (!result.failure||typeof result.failure.code==="string"&&(result.failure.httpStatus===undefined||Number.isInteger(result.failure.httpStatus)));
}
export function readMemorySystem(){const read=readJson<MemorySystemState>(MEMORY_SYSTEM_KEY,{version:1,choice:"pending",hasLegacy:false});return {...read,valid:read.valid&&read.value?.version===1&&["pending","declined","accepted"].includes(read.value.choice)&&typeof read.value.hasLegacy==="boolean"
 &&(read.value.migrationFinished===undefined||typeof read.value.migrationFinished==="boolean")
 &&(read.value.legacyOfflineReminderDismissed===undefined||typeof read.value.legacyOfflineReminderDismissed==="boolean")
 &&(read.value.migrationNoticePending===undefined||typeof read.value.migrationNoticePending==="boolean")
 &&(read.value.migrationResult===undefined||validResult(read.value.migrationResult))
 &&(read.value.migrationRequests===undefined||validRequests(read.value.migrationRequests))};}
export function chooseMemoryMigration(choice:MemoryMigrationChoice){const read=readMemorySystem();return read.valid?writeJson(MEMORY_SYSTEM_KEY,{...read.value,choice}):{success:false};}
