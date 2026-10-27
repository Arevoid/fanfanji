import { readMemorySystem, MEMORY_SYSTEM_KEY } from "../../../core/storage/repositories/memorySystemRepository";
import { writeJson } from "../../../core/storage/storageAdapter";
import { createId } from "../../../core/id/createId";
import { apiChat } from "../../../utils/apiHelper";

/** Metadata only; counters belong to this explicit migration, never a daily delta. */
export function beginMigrationRequests() {
  const state=readMemorySystem(),runId=createId("legacy-migration");
  return {runId,success:state.valid&&writeJson(MEMORY_SYSTEM_KEY,{...state.value,migrationRequests:{runId,attempted:0,succeeded:0,failed:0}}).success};
}
export function trackedMigrationRequest(runId:string,request:typeof apiChat=apiChat):typeof apiChat {
  const increment=(field:"attempted"|"succeeded"|"failed")=>{
    const state=readMemorySystem(),stats=state.value.migrationRequests;
    return Boolean(state.valid&&stats?.runId===runId&&writeJson(MEMORY_SYSTEM_KEY,{...state.value,migrationRequests:{...stats,[field]:stats[field]+1}}).success);
  };
  return async params=>{
    let started=false;
    try {
      const response=await request({...params,singleAttempt:true,purpose:"memory_migration",parentActionId:runId,
        beforeAttempt:async()=>{
          if(params.beforeAttempt&&!await params.beforeAttempt())return false;
          if(!increment("attempted"))throw Error("write_failed");
          started=true;return true;
        }});
      if(started&&!increment("succeeded"))throw Error("write_failed");
      return response;
    } catch(error) {
      if(started)increment("failed");
      throw error;
    }
  };
}
