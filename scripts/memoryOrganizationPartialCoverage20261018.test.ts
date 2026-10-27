import assert from "node:assert/strict";
import type {KnowledgeClaim} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type {UserSettings,Character} from "../src/types";
import {completeMemoryMigration} from "../src/features/characterKnowledge/services/completeMemoryMigrationService";
import {saveKnowledgeClaims,loadKnowledgeClaims} from "../src/core/storage/repositories/characterKnowledgeRepository";
import {organizationSourceRevision} from "../src/domain/characterKnowledge/knowledgeOrganization";
import {organizeLegacyMemory,readMemoryOrganization} from "../src/features/characterKnowledge/services/memoryOrganizationService";
const values=new Map<string,string>();Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}});
const scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"};
const claims:KnowledgeClaim[]=["一直害怕打雷。","一直收藏明信片。","下个月约好去看展。"].map((text,index)=>({...scope,id:`original-${index}`,statement:text,kind:"fact",subject:"user",temporalStatus:"unknown",truthStatus:"legacy_unverified",admissionStatus:"review",confidence:.25,userConfirmed:false,recordedAt:index+1,status:"active",visibility:"relation_private",schemaVersion:1,source:{kind:"legacy_memory",authorship:"unknown",producer:"synthetic",evidenceKey:`e${index}`,sourceRecordId:`e${index}`}}));
saveKnowledgeClaims(claims);values.set("phone_memory_continuity_migration_v1",JSON.stringify({version:1,status:"completed",completed:3,total:3,orphanIds:[],consentAt:1}));
values.set("phone_memory_organization_v1",JSON.stringify({version:1,migrationPolicyVersion:3,processed:Object.fromEntries(loadKnowledgeClaims().value.map(c=>[c.id,organizationSourceRevision(c)])),reviewIds:[],jobs:[]}));
let calls=0,reviews=0;
const request=async(params:{message:string})=>{calls++;const body=JSON.parse(params.message);assert.equal(body.stage,"associate");const item=(s:{sourceId:string})=>({sourceId:s.sourceId,association:null,valueAssessment:{impact:2,durability:2,novelty:1,confidence:.99,reason:"合成持续信息"}});return {text:JSON.stringify({items:body.sources.flatMap((s:{sourceId:string;text:string})=>s.text===claims[0].statement?[item(s)]:s.text===claims[1].statement?[item(s),item(s)]:[])})};};
for(let i=0;i<4;i++)assert.equal(await organizeLegacyMemory({scope,settings:{apiKey:"synthetic"} as UserSettings,visible:true,migrationDrain:true,now:1000+i*1000,request,reviewAuthorizedSettings:async candidates=>{reviews++;assert.deepEqual(candidates.map(c=>c.id),[claims[0].id],"missing and duplicate replies must not be sent through an invented fallback for value review");return {claims:[...candidates],skipped:0};}}),"completed");
assert.equal(calls,3,"each incomplete source has at most three attempts; other valid work is not re-sent");assert.equal(reviews,1);
const saved=loadKnowledgeClaims().value,state=readMemoryOrganization().value;
assert.equal(saved.find(c=>c.id===claims[0].id)?.admissionStatus,"retained");
for(const c of claims.slice(1)){assert.equal(saved.find(s=>s.id===c.id)?.admissionStatus,"review");assert.equal(saved.find(s=>s.id===c.id)?.statement,c.statement);assert.equal(state.unresolved?.[c.id]?.attempts,3);}
assert.deepEqual(Object.values(state.migrationScopes||{}),["needs_review"],"ended work with unresolved sources must not be reported as fully verified");
let retryCalls=0;
const retry=await completeMemoryMigration({characters:[{id:"a",name:"合成角色"} as Character],relationships:[],settings:{apiKey:"synthetic"} as UserSettings,consent:true,
  organize:async()=>{retryCalls++;return "failed";}});
assert.equal(retry.status,"needs_review");assert.equal(retryCalls,0,"global resume does not repeat unchanged held sources; individual review UI owns explicit reassessment");
assert.equal(readMemoryOrganization().value.associated?.[claims[0].id],state.associated?.[claims[0].id],"resuming must preserve already successful associations in the same relation");
console.log("PASS partial association coverage: valid sources persist, duplicates and omissions stay unchanged, bounded per-source retries, no invented value review and truthful needs_review; synthetic model only");
