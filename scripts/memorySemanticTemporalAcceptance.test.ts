import { meaningfulMemoryValue } from "./fixtures/memoryValueFixture";
import assert from "node:assert/strict";
import { MemoryService } from "../src/domain/memory/MemoryService";
import { appendToKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { semanticFactRegistry } from "../src/domain/characterKnowledge/semanticFactResolution";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { Character } from "../src/types";
const scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"};
const old:KnowledgeClaim={...scope,id:"old",statement:"我只养了一只橘猫，它叫芝麻。",kind:"fact",subject:"user",temporalStatus:"present",truthStatus:"asserted",status:"active",confidence:.9,userConfirmed:false,schemaVersion:1,visibility:"relation_private",recordedAt:100,source:{kind:"user_message",authorship:"user",producer:"synthetic",evidenceKey:"old",evidenceQuote:"我只养了一只橘猫，它叫芝麻。",messageIds:["old"]}};
async function run(source:string,effectiveNow?:boolean,temporalStatus:"present"|"future"="present"){
 const result=await MemoryService.extractMemories({...scope,character:{id:"a",name:"角色"} as Character,recentMessages:[{...scope,id:"m",content:source,sender:"user",timestamp:200}],existingClaims:[old],existingMemories:[],scenario:"chat",apiKey:"synthetic",model:"synthetic",createId:()=>"new",currentTime:()=>200,formatContent:items=>items.join("\n")},async params=>params.semanticReview?{semanticReviews:params.semanticReview.map(p=>({...p,sameEntity:true,sameAttribute:true,supported:true,confidence:.99,previousQuote:p.previousText,currentQuote:p.currentText,reason:"独立核对实际生效时间",...(effectiveNow===undefined?{}:{effectiveNow})}))}:{candidates:[{statement:"橘猫当前改名为糯米",kind:"fact",subject:"user",temporalStatus,sourceMessageIds:["m"],evidenceQuote:source, valueAssessment: meaningfulMemoryValue(source),factDecision:{entity:"橘猫",attribute:"名字",value:"糯米",operation:"change",targetClaimId:old.id,previousQuote:old.statement,currentQuote:source,confidence:.99,reason:"名称变更"}}]});
 return {result,records:appendToKnowledgeClaims([old],result.acceptedClaims)};
}
const source="我家唯一的橘猫从现在起叫糯米，芝麻这个名字以后不用了。";
const changed=await run(source,true);assert.equal(changed.result.apiError,undefined);assert.ok(changed.records[0].supersededById);assert.equal(changed.records[1].kind,"fact");assert.equal(changed.records[1].temporalStatus,"present");assert.equal(changed.records[1].source.evidenceQuote,source,"original quote is never rewritten to evade a guard");
for(const outcome of [await run(source,false),await run(source),await run("计划以后把橘猫改名为糯米。",false),await run("计划以后把橘猫改名为糯米。",true,"future"),await run("如果以后橘猫叫糯米就好了。",true)])assert.equal(outcome.records[0].supersededById,undefined,"absence/refusal/future/conditional guard must preserve current fact");
assert.equal(semanticFactRegistry(changed.records,scope,"橘猫名字").some(row=>row.id===old.id),false,"superseded versions are not current entity references");
console.log("PASS semantic time: independently confirmed present change survives future wording; absent/future/conditional evidence cannot override; verbatim source and current-only registry preserved");
