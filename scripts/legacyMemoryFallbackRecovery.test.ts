import assert from "node:assert/strict";
import type {KnowledgeClaim} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import {saveKnowledgeClaims,loadKnowledgeClaims} from "../src/core/storage/repositories/characterKnowledgeRepository";
import {ensureMemorySystemReady} from "../src/features/characterKnowledge/services/memorySystemService";
import {MEMORY_SYSTEM_KEY} from "../src/core/storage/repositories/memorySystemRepository";
import {filterRecallableKnowledge} from "../src/features/characterKnowledge/services/characterContinuityService";
import {organizationSourceRevision} from "../src/domain/characterKnowledge/knowledgeOrganization";
const values=new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}}});
values.set(MEMORY_SYSTEM_KEY,JSON.stringify({version:1,choice:"accepted",hasLegacy:true}));
const old={id:"old",characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c",statement:"An original experience.",kind:"fact",subject:"user",truthStatus:"legacy_unverified",temporalStatus:"past",status:"active",confidence:.25,userConfirmed:false,recordedAt:1,admissionStatus:"skipped",legacyCompatible:false,organizationOriginal:true,source:{kind:"legacy_memory",authorship:"unknown",producer:"fixture",evidenceKey:"old",sourceRecordId:"old"}} as KnowledgeClaim;
const excluded=[{...old,id:"deleted",status:"retracted"},{...old,id:"paused",recallDisabled:true},{...old,id:"updated",supersededById:"replacement"}] as KnowledgeClaim[];
for(const claim of [old,...excluded]){claim.schemaVersion=1;claim.visibility="relation_private";claim.statement+=` ${claim.id}`;}
const historical={...old,id:"historical",statement:"An older snapshot source.",organizationOriginal:false,source:{...old.source,kind:"automatic_summary" as const,sourceRecordId:"historical",evidenceKey:"historical"}};
values.set("phone_memory_continuity_legacy_snapshot_v1",JSON.stringify({claims:[old,historical]}));
assert.equal(saveKnowledgeClaims([old,historical,...excluded]).success,true);
const originalFetch=globalThis.fetch;let calls=0;
globalThis.fetch=(async()=>{calls++;throw Error("No API expected");}) as typeof fetch;
try{
 assert.equal(ensureMemorySystemReady().success,true);
 const records=loadKnowledgeClaims().value,recovered=records.find(c=>c.id===old.id)!;
 assert.equal(recovered.legacyCompatible,true);assert.equal(recovered.admissionStatus,"review");
 assert.equal(recovered.statement,old.statement);assert.deepEqual(recovered.source,old.source);
 assert.equal(recovered.truthStatus,old.truthStatus);assert.equal(recovered.confidence,old.confidence);
 assert.equal(organizationSourceRevision(recovered),organizationSourceRevision(old));
 assert.equal(filterRecallableKnowledge(records).filter(c=>c.id===old.id).length,1);
 assert.equal(records.find(c=>c.id===historical.id)?.legacyCompatible,true,"the saved migration snapshot identifies early records without organization flags");
 for(const id of excluded.map(c=>c.id))assert.notEqual(records.find(c=>c.id===id)?.legacyCompatible,true);
 const snapshot=JSON.stringify(records);assert.equal(ensureMemorySystemReady().success,true);
 assert.equal(JSON.stringify(loadKnowledgeClaims().value),snapshot,"restart recovery is idempotent");
 assert.equal(calls,0);
 console.log("PASS startup legacy fallback recovery: no API, exact provenance and authority, idempotency, explicit exclusions preserved");
}finally{globalThis.fetch=originalFetch;}
