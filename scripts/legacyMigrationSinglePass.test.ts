import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryMigrationCompletion } from "../src/features/characterKnowledge/components/MemoryMigrationCompletion";
import { completeMemoryMigration, isCompletingMemoryMigration } from "../src/features/characterKnowledge/services/completeMemoryMigrationService";
import { organizeLegacyMemory } from "../src/features/characterKnowledge/services/memoryOrganizationService";
import { estimateLegacyMigration } from "../src/features/characterKnowledge/services/memoryMigrationEstimate";
import { saveKnowledgeClaims, loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { readMemorySystem } from "../src/core/storage/repositories/memorySystemRepository";
import { consumeMemoryMigrationNotice } from "../src/features/characterKnowledge/services/memoryMigrationFinalization";
import type { Character, UserSettings } from "../src/types";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { MemorySettingReviewer } from "../src/features/characterKnowledge/services/memorySettingReviewService";
const values = new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}}});
const scope={characterId:"c",relationId:"r",userIdentityId:"u",conversationId:"conv"};
const claim=(id:string,text:string):KnowledgeClaim=>({...scope,id,statement:text,kind:"fact",subject:"user",truthStatus:"legacy_unverified",temporalStatus:"past",confidence:.25,userConfirmed:false,status:"active",visibility:"relation_private",recordedAt:1,schemaVersion:1,source:{kind:"legacy_memory",authorship:"unknown",producer:"test",evidenceKey:id,sourceRecordId:id}});
const characters=[{id:"c",name:"C"}] as Character[];
const relationships=[{id:"r",...scope,relationship:"friend" as const,createdAt:1,updatedAt:1}];
const settings={apiKey:"fixture"} as UserSettings;
let calls=0,secondary=0;
const reviewer:MemorySettingReviewer=async()=>{secondary++;throw Error("secondary request forbidden");};
reviewer.inlineSettings=()=>[];
const run=(mode:"valid"|"uncertain"|"invalid"="valid")=>completeMemoryMigration({characters,relationships,settings,consent:true,
 organize:args=>organizeLegacyMemory({...args,reviewAuthorizedSettings:reviewer,request:async params=>{
  calls++;assert.equal(params.singleAttempt,true);
  const body=JSON.parse(params.message);assert.equal(body.stage,"atomize");assert.deepEqual(body.registry,[]);
  assert.ok(body.sources.length<=60);assert.ok(body.sources.reduce((n:number,s:any)=>n+s.text.length,0)<=24000);
  const inputCharacters=body.sources.reduce((n:number,s:any)=>n+s.text.length,0);
  assert.equal(params.maxOutputTokens,body.sources.length>20||inputCharacters>6000?16384:8192);
  if(mode==="invalid")return {text:"invalid response"};
  return {text:JSON.stringify({items:body.sources.flatMap((s:any)=>{const parts=s.text.match(/[^。]+。/gu)||[s.text];return Array.from(new Set(s.text.length>1900?[parts[0],parts.at(-1)]:[s.text])).map(quote=>({sourceId:s.sourceId,quote,kind:"fact",temporalStatus:"past",association:null,
   valueAssessment:{impact:2,durability:3,novelty:1,confidence:.99,reason:"durable experience"},
   settingReview:{decision:mode==="uncertain"?"uncertain":"new_experience",confidence:.99,reason:"source supported"}}));})})};
 }})});
saveKnowledgeClaims(Array.from({length:25},(_,i)=>claim(`old-${i}`,`用户珍藏第${i}次旅行的纪念照片。`)));
const task=run();assert.equal(isCompletingMemoryMigration(),true);
await task;assert.equal(calls,1,"25 sources use one request, no association stage");assert.equal(secondary,0);
assert.equal(readMemorySystem().value.migrationResult?.newlyOrganized,25);
assert.equal(readMemorySystem().value.migrationNoticePending,true,"completion remains pending outside memory UI");
const markup=renderToStaticMarkup(createElement(MemoryMigrationCompletion));
assert.match(markup,/旧记忆处理结果/u);assert.doesNotMatch(markup,/旧记忆来源 25 条/u);assert.match(markup,/知道了/u);
assert.equal(readMemorySystem().value.migrationNoticePending,true,"displaying a result does not consume it before dismissal");
await run();assert.equal(calls,1,"completed batches never repeat");
assert.equal(consumeMemoryMigrationNotice(),true);assert.equal(consumeMemoryMigrationNotice(),false);
values.clear();calls=0;saveKnowledgeClaims(Array.from({length:200},(_,i)=>claim(`bulk-${i}`,`用户珍藏第${i}次旅行的纪念照片。`)));
await run();assert.equal(calls,4,"200 same-scope short sources use four requests");assert.equal(secondary,0);
await run();assert.equal(calls,4,"reopening migration does not resend completed sources");
values.clear();calls=0;saveKnowledgeClaims(Array.from({length:200},(_,i)=>claim(`duplicate-${i}`,"用户一直保存母亲送给自己的明信片。")));
assert.equal(estimateLegacyMigration()?.batches,1,"estimate shares request-side exact-content reuse");
await run();assert.equal(calls,1,"local exact duplicates do not generate 200 API inputs");
values.clear();calls=0;saveKnowledgeClaims(Array.from({length:61},(_,i)=>claim(`failed-${i}`,`用户珍藏第${i}次旅行的纪念照片。`)));
await run("invalid");assert.equal(calls,1,"large-batch failure never splits into smaller paid retry requests");
assert.equal(loadKnowledgeClaims().value.filter(claim=>claim.legacyCompatible&&claim.status==="active").length,61);
for(const mode of ["uncertain","invalid"] as const){
 values.clear();calls=0;saveKnowledgeClaims([claim("held","用户一直保存母亲送给自己的明信片。")]);
 await run(mode);assert.equal(calls,1,"uncertainty and malformed output never append reviewer/repair requests");
 assert.equal(secondary,0);assert.equal(readMemorySystem().value.migrationResult?.newlyOrganized,0);
 assert.ok(loadKnowledgeClaims().value.some(c=>c.legacyCompatible&&c.status==="active"));
}
values.clear();calls=0;
const long="用户珍藏旧旅行的纪念照片。".repeat(4200)+"最后一页写着用户害怕打雷。";
saveKnowledgeClaims([claim("long",long)]);await run();assert.equal(calls,Math.ceil(long.length/24000));
assert.ok(loadKnowledgeClaims().value.some(c=>c.statement.includes("用户害怕打雷")),"long-source tail is retained");
console.log("PASS legacy single-pass: one request/batch, 60-source/24000-character bounds, zero secondary calls, failure fallback, long tail, durable one-time completion");
