import assert from "node:assert/strict";
import { beginMigrationRequests, trackedMigrationRequest } from "../src/features/characterKnowledge/services/memoryMigrationRequests";
import { readMemorySystem } from "../src/core/storage/repositories/memorySystemRepository";
import { startCharacterContinuityRuntime } from "../src/features/characterKnowledge/services/characterContinuityRuntime";
import { saveKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import type { Character, UserSettings } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
const values=new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)},setTimeout,clearTimeout}});
const events=Object.assign(new EventTarget(),{visibilityState:"visible"});
Object.defineProperty(globalThis,"document",{configurable:true,value:events});
const session=beginMigrationRequests();assert.equal(session.success,true);
let fetches=0;
const request=trackedMigrationRequest(session.runId,async params=>{
 assert.equal(params.purpose,"memory_migration");assert.equal(params.parentActionId,session.runId);assert.equal(params.singleAttempt,true);
 if(params.beforeAttempt&&!await params.beforeAttempt())throw Error("budget");
 fetches++;if(fetches===2)throw Error("HTTP 502");return {text:"invalid content is still a returned response"};
});
await request({apiKey:"fixture",model:"fixture",message:"fixture",history:[]});await assert.rejects(request({apiKey:"fixture",model:"fixture",message:"fixture",history:[]}));
await assert.rejects(request({apiKey:"fixture",model:"fixture",message:"fixture",history:[],beforeAttempt:()=>false}));
assert.deepEqual(readMemorySystem().value.migrationRequests,{runId:session.runId,attempted:2,succeeded:1,failed:1});
assert.equal(fetches,2,"budget refusal before dispatch is not a provider request");
const originalFetch=globalThis.fetch;
try {
 let physical=0;
 globalThis.fetch=(async()=>{physical++;return physical===1?Response.json({text:"ok"}):Response.json({error:"unavailable"},{status:502});}) as typeof fetch;
 const transport=trackedMigrationRequest(session.runId);
 const params={apiKey:"fixture",model:"fixture",message:"fixture",history:[],apiEndpoint:"https://example.invalid/v1"};
 await transport(params);await assert.rejects(transport(params));
 assert.equal(physical,2,"real frontend transport has no retry or fallback");
 assert.deepEqual(readMemorySystem().value.migrationRequests,{runId:session.runId,attempted:4,succeeded:2,failed:2});
}finally{globalThis.fetch=originalFetch;}
const relations=["a","b"].map(characterId=>({id:`r-${characterId}`,characterId,userIdentityId:"u",conversationId:`c-${characterId}`,relationship:"friend",createdAt:1,updatedAt:1})) as CharacterRelationship[];
const claim=(id:string,characterId="a"):KnowledgeClaim=>({id,characterId,relationId:`r-${characterId}`,userIdentityId:"u",conversationId:`c-${characterId}`,statement:"用户害怕打雷",source:{kind:"user_message",authorship:"user",messageIds:[id],producer:"test",evidenceKey:id},kind:"fact",subject:"user",truthStatus:"asserted",temporalStatus:"present",confidence:.9,userConfirmed:false,recordedAt:Date.now(),status:"active",visibility:"relation_private",schemaVersion:1,admissionStatus:"retained"});
saveKnowledgeClaims([claim("existing")]);const calls:string[]=[];
const runtime=startCharacterContinuityRuntime({characters:relations.map(r=>({id:r.characterId,name:r.characterId})) as Character[],relationships:relations,settings:{apiKey:"fixture"} as UserSettings,visible:()=>true,run:async input=>{calls.push(input.scope.characterId);return "completed";}});
try {
 await runtime.check();assert.deepEqual(calls,[],"opening/timer checks cannot generate life or impressions from old evidence");
 saveKnowledgeClaims([claim("existing"),{...claim("migrated"),organizationSourceId:"old"}]);
 events.dispatchEvent(new Event("fanfanji:memory-migration-finished"));
 await runtime.check();await runtime.check();assert.deepEqual(calls,[],"migration completion and subsequent idle checks cannot fan out paid work");
 saveKnowledgeClaims([claim("existing"),claim("new-a")]);await runtime.check();assert.deepEqual(calls,[],"new interaction is handled by its archive response, not a second paid reflection");
 await runtime.check();assert.deepEqual(calls,[],"unchanged evidence does not repeat generation");
 saveKnowledgeClaims([claim("existing"),claim("new-a"),claim("new-b","b")]);await runtime.check();assert.deepEqual(calls,[]);
 saveKnowledgeClaims([claim("new-b","b")]);await runtime.check();assert.deepEqual(calls,[],"deleting evidence is not a new paid-generation trigger");
}finally{runtime.stop();}
console.log("PASS paid isolation: per-run boundary counts, no count for pre-dispatch refusal, no startup/post-migration fan-out, role-specific new-evidence gating");
