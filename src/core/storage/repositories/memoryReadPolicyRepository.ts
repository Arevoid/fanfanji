import {readJson,writeJson} from "../storageAdapter";
const KEY="phone_memory_read_policy_v1";
interface Policy {version:1;identities:Record<string,"current"|"compatibility">}
const read=()=>{
  const result=readJson<Policy>(KEY,{version:1,identities:{}});
  const value=result.value;
  const valid=result.valid&&value?.version===1&&Boolean(value.identities)&&typeof value.identities==="object"&&!Array.isArray(value.identities)
    &&Object.values(value.identities).every(mode=>mode==="current"||mode==="compatibility");
  return {...result,valid};
};
export function getMemoryReadMode(userIdentityId:string):"current"|"compatibility" {
  const result=read();return result.valid&&result.value?.version===1&&result.value.identities?.[userIdentityId]==="compatibility"?"compatibility":"current";
}
export function setMemoryReadMode(userIdentityId:string,mode:"current"|"compatibility") {
  const current=read();if(!current.valid||!userIdentityId||!["current","compatibility"].includes(mode))return {success:false,error:"validation" as const};
  return writeJson(KEY,{version:1,identities:{...current.value.identities,[userIdentityId]:mode}});
}
