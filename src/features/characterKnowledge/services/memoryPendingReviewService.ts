import type { CharacterTruthScope, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import { organizationSourceRevision } from "../../../domain/characterKnowledge/knowledgeOrganization";
import { normalizeKnowledgeClaim } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { replaceMemoryStores } from "../../../core/storage/memoryStoreTransaction";
import { storageKeys } from "../../../core/storage/storageKeys";
import { readJson } from "../../../core/storage/storageAdapter";
import { MEMORY_ORGANIZATION_KEY, readMemoryOrganization } from "./memoryOrganizationService";
export const MEMORY_REVIEW_HISTORY_KEY="phone_memory_review_actions_v1";
const HISTORY=MEMORY_REVIEW_HISTORY_KEY;
interface Action {id:string;before:KnowledgeClaim;after:KnowledgeClaim;at:number;undone?:boolean}
export function normalizeMemoryReviewHistory(value:unknown):Action[]|undefined {
  if(!Array.isArray(value))return undefined;
  const result:Action[]=[];
  for(const raw of value){
    if(!raw||typeof raw!=="object"||typeof raw.id!=="string"||!Number.isFinite(raw.at))return undefined;
    const before=normalizeKnowledgeClaim(raw.before),after=normalizeKnowledgeClaim(raw.after);
    if(!before||!after||before.id!==after.id||!isExactTruthScope(before,after)||(raw.undone!==undefined&&typeof raw.undone!=="boolean"))return undefined;
    result.push({id:raw.id,before,after,at:raw.at,...(raw.undone!==undefined?{undone:raw.undone}:{})});
  }return result;
}
export const readMemoryReviewHistory=()=>readJson<Action[]>(HISTORY,[]);
export function pendingMemoryReviews(identityId:string,characterId="all",relationId="all") {
  return loadKnowledgeClaims().value.filter(c=>c.userIdentityId===identityId&&(characterId==="all"||c.characterId===characterId)
    &&(relationId==="all"||c.relationId===relationId)&&c.status==="active"&&!c.supersededById&&!c.organizationOriginal&&!c.offlineArchiveManaged&&c.admissionStatus==="review");
}
export function resolvePendingMemory(input:{scope:CharacterTruthScope;id:string;expectedRevision:string;action:"retain"|"skip"|"retry";now?:number}) {
  const read=loadKnowledgeClaims(),org=readMemoryOrganization(),history=readJson<Action[]>(HISTORY,[]);
  const target=read.value.find(c=>c.id===input.id&&isExactTruthScope(c,input.scope)&&c.status==="active"&&!c.supersededById&&!c.organizationOriginal);
  if(!read.valid||!org.valid||!history.valid||!Array.isArray(history.value)||!target||target.admissionStatus!=="review"||organizationSourceRevision(target)!==input.expectedRevision)return {success:false};
  const next=input.action==="retry"?target:{...target,admissionStatus:input.action==="retain"?"retained" as const:"skipped" as const,
    intervention:true,valueReason:input.action==="retain"?"用户选择保留；原来源可信度与时间状态不变":"用户选择不作为长期记忆；原始资料保留"};
  const ids=new Set([target.id]);
  const unresolved=Object.fromEntries(Object.entries(org.value.unresolved||{}).filter(([id])=>!ids.has(id)));
  const associated={...org.value.associated},valueReviewed={...org.value.valueReviewed};delete associated[target.id];delete valueReviewed[target.id];
  const scopeKey=JSON.stringify([target.characterId,target.relationId,target.userIdentityId,target.conversationId]);
  const migrationScopes={...org.value.migrationScopes};
  const records=read.value.map(c=>c.id===target.id?next:c);
  if(input.action==="retry")delete migrationScopes[scopeKey];
  else if(!records.some(c=>isExactTruthScope(c,target)&&c.status==="active"&&!c.organizationOriginal&&!c.supersededById&&c.admissionStatus==="review"))migrationScopes[scopeKey]="completed";
  const action:Action={id:`review:${target.id}:${input.now??Date.now()}`,before:target,after:next,at:input.now??Date.now()};
  const result=replaceMemoryStores({[storageKeys.characterKnowledgeClaims]:records,[MEMORY_ORGANIZATION_KEY]:{...org.value,unresolved,associated,valueReviewed,migrationScopes,
    reviewIds:org.value.reviewIds.filter(id=>id!==target.id)},[HISTORY]:[...history.value,action]});
  if(result.success&&typeof document!=="undefined")document.dispatchEvent(new Event("fanfanji:memory-data-updated"));
  return result;
}
export function undoPendingMemoryAction(scope:CharacterTruthScope,id:string) {
  const read=loadKnowledgeClaims(),history=readJson<Action[]>(HISTORY,[]),org=readMemoryOrganization();
  const action=history.value?.filter(a=>a.id&&a.before?.id===id&&!a.undone&&isExactTruthScope(a.before,scope)).at(-1);
  const target=read.value.find(c=>c.id===id&&isExactTruthScope(c,scope));
  if(!read.valid||!history.valid||!org.valid||!action||!target||JSON.stringify(target)!==JSON.stringify(action.after))return {success:false};
  const key=JSON.stringify([scope.characterId,scope.relationId,scope.userIdentityId,scope.conversationId]);
  const result=replaceMemoryStores({[storageKeys.characterKnowledgeClaims]:read.value.map(c=>c.id===id?action.before:c),[HISTORY]:history.value.map(a=>a===action?{...a,undone:true}:a),
    [MEMORY_ORGANIZATION_KEY]:{...org.value,migrationScopes:{...org.value.migrationScopes,[key]:"needs_review"},reviewIds:[...new Set([...org.value.reviewIds,id])]}});
  if(result.success&&typeof document!=="undefined")document.dispatchEvent(new Event("fanfanji:memory-data-updated"));return result;
}
