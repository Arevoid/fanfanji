import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { UserSettings } from "../src/types";
import { saveKnowledgeClaims, loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { organizeLegacyMemory, readMemoryOrganization } from "../src/features/characterKnowledge/services/memoryOrganizationService";
const values = new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}}});
const scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"};
const base:KnowledgeClaim={...scope,id:"old",statement:"我一直害怕雷声。",kind:"fact",subject:"user",temporalStatus:"unknown",truthStatus:"legacy_unverified",confidence:.25,userConfirmed:false,recordedAt:1,status:"active",visibility:"relation_private",schemaVersion:1,source:{kind:"legacy_memory",authorship:"unknown",producer:"legacy",evidenceKey:"old",sourceRecordId:"old"}};
const settings={apiKey:"synthetic",selectedModel:"synthetic"} as UserSettings;
for(const empty of [true,false]){
 values.clear();saveKnowledgeClaims([base]);
 values.set("phone_memory_continuity_migration_v1",JSON.stringify({version:1,status:"completed",completed:1,total:1,orphanIds:[],consentAt:1}));
 let calls=0;
 const request=async(params:{message:string})=>{calls++;return{text:JSON.stringify({items:empty?[]:[{sourceId:JSON.parse(params.message).sources[0].sourceId,quote:base.statement,kind:"fact",temporalStatus:"unknown"}]})}};
 assert.equal(await organizeLegacyMemory({scope,settings,visible:true,now:1000,request}),"completed");
 if(empty){assert.equal(readMemoryOrganization().value.processed[base.id],undefined,"empty output cannot mark a source structurally complete");assert.equal(readMemoryOrganization().value.offsets?.[base.id]?.offset,0);}
 else{assert.ok(readMemoryOrganization().value.processed[base.id],"literal extraction can finish while its value remains pending");assert.equal(loadKnowledgeClaims().value[0].admissionStatus,"review","unassessed extracted content cannot enter formal recall");}
 assert.equal(loadKnowledgeClaims().value.find(claim=>claim.id===base.id)?.statement,base.statement);
 await organizeLegacyMemory({scope,settings,visible:true,now:2000,request});
 assert.equal(calls,2,"retry actually revisits the unresolved fragment");
 await organizeLegacyMemory({scope,settings,visible:true,now:3000,request});
 assert.equal(calls,2,"daily budget bounds unresolved retries");
 await organizeLegacyMemory({scope,settings,visible:true,now:86_401_000,request});
 assert.equal(calls,3);
 await organizeLegacyMemory({scope,settings,visible:true,now:172_801_000,request});
 assert.equal(calls,3,"three inconclusive judgments stop automatic paid retries until the source changes");
}
values.clear();saveKnowledgeClaims([base]);
values.set("phone_memory_continuity_migration_v1",JSON.stringify({version:1,status:"completed",completed:1,total:1,orphanIds:[],consentAt:1}));
await organizeLegacyMemory({scope,settings,visible:true,now:1000,request:async params=>({text:JSON.stringify({items:[{sourceId:JSON.parse(params.message).sources[0].sourceId,quote:base.statement,kind:"fact",temporalStatus:"unknown",valueAssessment:{quote:base.statement,impact:2,durability:2,novelty:1,confidence:.99,reason:"持续信息"}}]})}),
 reviewAuthorizedSettings:async claims=>({claims:claims.map(claim=>({...claim,admissionStatus:"review",valueReason:"与设定存在冲突"})),skipped:0})});
assert.equal(loadKnowledgeClaims().value[0].admissionStatus,"review","atomic in-place enrichment cannot overwrite an independent conflict hold");
assert.ok(readMemoryOrganization().value.processed[base.id],"a conflict hold must not force repeated extraction of an already parsed source");
console.log("PASS organization retry: empty source remains retryable; parsed but unassessed/conflicting content stays pending, with bounded value retries and no repeated full extraction; simulated model only");
