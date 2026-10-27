// Historical multi-stage regression; single-pass production path is verified separately.
import assert from "node:assert/strict";
import {completeMemoryMigration} from "../src/features/characterKnowledge/services/completeMemoryMigrationService";
import {organizeLegacyMemory,readMemoryOrganization} from "../src/features/characterKnowledge/services/memoryOrganizationService";
import {organizationSourceRevision} from "../src/domain/characterKnowledge/knowledgeOrganization";
import {createMemorySettingReviewer} from "../src/features/characterKnowledge/services/memorySettingReviewService";
import {saveKnowledgeClaims,loadKnowledgeClaims} from "../src/core/storage/repositories/characterKnowledgeRepository";
import {readMemoryMigrationCoverage} from "../src/features/characterKnowledge/services/memoryMigrationCoverage";
const values=new Map<string,string>();Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}});
const scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"},character={id:"a",name:"甲",personality:"",backstory:""} as any,settings={apiKey:"synthetic"} as any;
async function run(inline:boolean){
 values.clear();let calls=0;
 saveKnowledgeClaims(Array.from({length:16},(_,i)=>({...scope,id:`old-${i}`,statement:`用户珍藏了第${i}次旅行的明信片。`,kind:"fact",subject:"user",truthStatus:"legacy_unverified",temporalStatus:"past",confidence:.25,status:"active",visibility:"relation_private",schemaVersion:1,userConfirmed:false,recordedAt:i+1,source:{kind:"legacy_memory",authorship:"unknown",producer:"fixture",evidenceKey:`old-${i}`,sourceRecordId:`old-${i}`}} as any)));
 const request=async(params:any)=>{calls++;const body=JSON.parse(params.message);
  if(body.sources)return {text:JSON.stringify({items:body.sources.map((s:any)=>({sourceId:s.sourceId,quote:s.text,kind:"fact",temporalStatus:"past",association:null,valueAssessment:{quote:s.text,impact:2,durability:3,novelty:1,confidence:.99,reason:"有持续价值的经历"},settingReview:{decision:"new_experience",confidence:.99,reason:"有持续价值且不是设定复述"}}))})};
  return {text:JSON.stringify({reviews:body.candidates.map((c:any)=>({id:c.id,sourceQuote:c.sourceQuote,decision:"new_experience",confidence:.99,reason:"有持续价值"}))})};
 };
 const reviewer=createMemorySettingReviewer(character,scope,"chat",settings,request);
 const result=await completeMemoryMigration({characters:[character],relationships:[{id:"r",...scope}] as any,settings,consent:true,
  organize:args=>organizeLegacyMemory({...args,singlePassMigration:false,request,reviewAuthorizedSettings:inline?reviewer:claims=>reviewer(claims)})});
 assert.equal(result.status,"completed");const coverage=readMemoryMigrationCoverage();assert.equal(coverage.total,16);assert.equal(coverage.organized,16);assert.equal(coverage.pending,0);assert.equal(coverage.missing,0);
 const content=loadKnowledgeClaims().value.map(c=>({id:c.id,statement:c.statement,status:c.status,truthStatus:c.truthStatus,admission:c.admissionStatus,scope:[c.characterId,c.relationId,c.userIdentityId,c.conversationId]}));
 const prior=calls;await completeMemoryMigration({characters:[character],relationships:[{id:"r",...scope}] as any,settings,consent:false,organize:args=>organizeLegacyMemory({...args,singlePassMigration:false,request,reviewAuthorizedSettings:reviewer})});assert.equal(calls,prior,"completed sources are reused without new requests");
 return {calls,content};
}
const before=await run(false),after=await run(true);assert.deepEqual(after.content,before.content);assert.ok(after.calls<=before.calls*2/3,JSON.stringify({before:before.calls,after:after.calls}));
const held={...loadKnowledgeClaims().value[0],admissionStatus:"review" as const,legacyCompatible:true};saveKnowledgeClaims(loadKnowledgeClaims().value.map(c=>c.id===held.id?held:c));
const state=readMemoryOrganization().value,key=JSON.stringify([scope.characterId,scope.relationId,scope.userIdentityId,scope.conversationId]);
values.set("phone_memory_organization_v1",JSON.stringify({...state,migrationScopes:{...state.migrationScopes,[key]:"needs_review"},unresolved:{...state.unresolved,[held.id]:{revision:organizationSourceRevision(held),attempts:3}}}));
let repeated=0;const resumed=await completeMemoryMigration({characters:[character],relationships:[{id:"r",...scope}] as any,settings,consent:false,organize:async()=>{repeated++;return "failed";}});
assert.equal(resumed.status,"completed");assert.equal(repeated,0,"a finalized migration never reopens held evidence into more paid reviews");
console.log(`PASS migration efficiency: same 16-source corpus and authority/scope; requests ${before.calls} -> ${after.calls}; completed restart zero calls; coverage reconciles all sources (synthetic model)`);
