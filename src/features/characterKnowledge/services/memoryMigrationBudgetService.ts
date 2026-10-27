import { readJson, writeJson } from "../../../core/storage/storageAdapter";
import { apiChat } from "../../../utils/apiHelper";
const KEY="phone_memory_migration_budget_v1";
interface Budget { day:string; used:number; limit:number; paused:boolean }
const day=(now:number)=>new Date(now).toDateString();
export function readMemoryMigrationBudget(now=Date.now()) {
  const read=readJson<Budget>(KEY,{day:day(now),used:0,limit:200,paused:false});
  const valid=read.valid&&typeof read.value?.day==="string"&&Number.isInteger(read.value.used)&&read.value.used>=0&&Number.isInteger(read.value.limit)&&read.value.limit>=1&&read.value.limit<=10000&&typeof read.value.paused==="boolean";
  return {valid,value:valid?{...read.value,...(read.value.day!==day(now)?{day:day(now),used:0}:{})}:{day:day(now),used:0,limit:200,paused:true}};
}
export function configureMemoryMigrationBudget(limit:number,paused:boolean,now=Date.now()) {
  const read=readMemoryMigrationBudget(now);
  if(!read.valid||!Number.isInteger(limit)||limit<1||limit>10000)return {success:false};
  return writeJson(KEY,{...read.value,limit,paused});
}
export async function reserveMemoryMigrationAttempt(now=Date.now()):Promise<boolean> {
  const reserve=()=>{const read=readMemoryMigrationBudget(now);return read.valid&&!read.value.paused&&read.value.used<read.value.limit
    &&writeJson(KEY,{...read.value,used:read.value.used+1}).success;};
  return typeof navigator!=="undefined"&&navigator.locks?.request?navigator.locks.request("fanfanji:memory-migration-budget",reserve):reserve();
}
/** Conservatively counts attempted proxy delivery (including uncertain delivery)
 * and direct fallback separately. Server forwarding is not counted twice. */
export function withMemoryMigrationBudget(request:typeof apiChat=apiChat):typeof apiChat {
  return async params=>{
    if(request===apiChat)return request({...params,beforeAttempt:params.beforeAttempt||(()=>reserveMemoryMigrationAttempt())});
    if(!await reserveMemoryMigrationAttempt())throw Error("memory_migration_budget_limited");
    return request(params);
  };
}
