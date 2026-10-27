import assert from "node:assert/strict";
import {MemoryService} from "../src/domain/memory/MemoryService";
import {evolveKnowledgeClaims} from "../src/domain/characterKnowledge/knowledgeEvolution";
import type {KnowledgeClaim} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type {Character} from "../src/types";
import {meaningfulMemoryValue} from "./fixtures/memoryValueFixture";
import {normalizeSemanticFactDecision} from "../src/domain/characterKnowledge/semanticFactResolution";
const scope={characterId:"c",relationId:"r",userIdentityId:"u",conversationId:"conv"};
const old={...scope,id:"old",statement:"我只养了一只橘猫，它叫芝麻。",kind:"fact",subject:"user",temporalStatus:"present",truthStatus:"asserted",status:"active",schemaVersion:1,visibility:"relation_private",confidence:.9,userConfirmed:false,recordedAt:100,source:{kind:"user_message",authorship:"user",producer:"synthetic",evidenceKey:"old",messageIds:["old-source"],evidenceQuote:"我只养了一只橘猫，它叫芝麻。"}} as KnowledgeClaim;
const source="我家唯一的橘猫从现在起叫糯米，芝麻这个名字以后不用了。";
async function run(mode:"approve"|"deny"|"timeout"|"foreign"){let calls=0;const result=await MemoryService.extractMemories({...scope,requireFactResolution:true,character:{id:"c",name:"角色"} as Character,existingClaims:[old],existingMemories:[],recentMessages:[{...scope,id:"new-source",sender:"user",content:source,timestamp:200}],scenario:"chat",apiKey:"synthetic",model:"synthetic",createId:()=>"new",currentTime:()=>200,formatContent:items=>items.join("\n")},async p=>{
 calls++;
 if(p.identityReview){assert.equal(p.identityReview.length,1);assert.ok(p.semanticRegistry?.every(r=>r.id===old.id));if(mode==="timeout")throw Error("synthetic timeout");return {identityReviews:[{index:p.identityReview[0].index,factDecision:{entity:"家中唯一的橘猫",attribute:"名字",value:"糯米",operation:"change",targetClaimId:mode==="foreign"?"foreign-id":"old",currentQuote:source,previousQuote:old.statement,confidence:.99,reason:"同一只猫的名字现在改变"}}]};}
 if(p.semanticReview)return {semanticReviews:p.semanticReview.map(proposal=>({index:proposal.index,previousId:proposal.previousId,sameEntity:true,sameAttribute:true,supported:mode==="approve",operation:proposal.operation,confidence:.99,previousQuote:old.statement,currentQuote:source,effectiveNow:true,reason:"逐字来源证明当前变化"}))};
 return {candidates:[{statement:"用户家中唯一的橘猫现在叫糯米",kind:"fact",subject:"user",temporalStatus:"present",sourceMessageIds:["new-source"],evidenceQuote:source,valueAssessment:meaningfulMemoryValue(source)}]};
 });return {result,calls,records:evolveKnowledgeClaims([old],result.acceptedClaims)};}
const approved=await run("approve");assert.equal(approved.calls,3);assert.equal(approved.result.apiError,undefined);assert.ok(approved.records[0].supersededById);assert.equal(approved.records.at(-1)?.factDecision?.value,"糯米");assert.equal(approved.records.at(-1)?.temporalStatus,"present");
const past={...approved.result.acceptedClaims[0],id:'independent-past',temporalStatus:'past' as const,factDecision:{...approved.result.acceptedClaims[0].factDecision!,operation:'new' as const},supersedesId:undefined};
const history=evolveKnowledgeClaims([old],[past]);assert.equal(history[0].supersededById,undefined);assert.equal(history.at(-1)?.truthStatus,past.truthStatus,'a new past experience is not an invalid current-state overwrite');
assert.ok(normalizeSemanticFactDecision({...approved.records.at(-1)!.factDecision,condition:null,conditionRelation:null}),"optional null is absent, never coerced into a condition or confidence");
for(const mode of ["deny","timeout","foreign"] as const){const failed=await run(mode);assert.equal(failed.records[0].supersededById,undefined);if(mode!=="deny")assert.equal(failed.result.apiError,"semantic_identity_unavailable");}
for(const mode of ['recover','none','bad-source'] as const){
 let calls=0;
 const result=await MemoryService.extractMemories({...scope,requireFactResolution:true,character:{id:'c',name:'角色'} as Character,existingClaims:[old],existingMemories:[],recentMessages:[{...scope,id:'new-source',sender:'user',content:source,timestamp:200}],scenario:'chat',apiKey:'synthetic',model:'synthetic',createId:()=>mode,currentTime:()=>200,formatContent:items=>items.join('\n')},async params=>{
   calls++;
   if(params.identityReview){const item=params.identityReview[0];assert.equal(item.recoverCandidate,true);return {identityReviews:[{index:item.index,candidate:mode==='none'?null:{statement:'用户家的橘猫现在叫糯米',kind:'fact',subject:'user',temporalStatus:'present',sourceMessageIds:mode==='bad-source'?['foreign']:[...item.sourceMessageIds!],evidenceQuote:source,valueAssessment:meaningfulMemoryValue(source),factDecision:{...approved.records.at(-1)!.factDecision,condition:null,conditionRelation:null}}}]};}
   if(params.semanticReview)return {semanticReviews:params.semanticReview.map(p=>({index:p.index,previousId:p.previousId,sameEntity:true,sameAttribute:true,supported:true,operation:p.operation,confidence:.99,previousQuote:old.statement,currentQuote:source,effectiveNow:true,reason:'独立核验当前变化'}))};
   return {candidates:[]};
 });
 if(mode==='recover'){assert.ok(evolveKnowledgeClaims([old],result.acceptedClaims)[0].supersededById);assert.equal(calls,3);}
 if(mode==='none'){assert.equal(result.apiError,undefined);assert.equal(result.acceptedClaims.length,0);assert.equal(calls,2);}
 if(mode==='bad-source')assert.equal(result.apiError,'semantic_identity_unavailable');
}
for(const eventConfidence of [.9,.99]){
 const result=await MemoryService.extractMemories({...scope,character:{id:'c',name:'角色'} as Character,existingClaims:[old],existingMemories:[],recentMessages:[{...scope,id:'new-source',sender:'user',content:source,timestamp:200}],scenario:'chat',apiKey:'synthetic',model:'synthetic',createId:()=>`ancillary-${eventConfidence}`,currentTime:()=>200,formatContent:items=>items.join('\n')},async params=>params.semanticReview?{semanticReviews:params.semanticReview.map(p=>({index:p.index,previousId:p.previousId,sameEntity:true,sameAttribute:true,supported:true,operation:p.operation,confidence:p.type==='event'?eventConfidence:.99,previousQuote:p.previousText,currentQuote:source,effectiveNow:true,reason:'独立核对来源'}))}:{candidates:[{statement:source,kind:'fact',subject:'user',temporalStatus:'present',sourceMessageIds:['new-source'],evidenceQuote:source,valueAssessment:meaningfulMemoryValue(source),factDecision:approved.records.at(-1)!.factDecision,event:{activity:'改名',state:'confirmed'}}]});
 const records=evolveKnowledgeClaims([old],result.acceptedClaims);
 assert.ok(records[0].supersededById,'verified attribute change is not blocked by an ancillary event proposal');
 assert.equal(records.at(-1)?.event,undefined,'attribute transition cannot become an unrelated future plan');
 assert.equal(records.at(-1)?.factDecision?.currentQuote,source,'current evidence is the independently verified verbatim quote');
 assert.equal(records.at(-1)?.temporalStatus,'present');
}
console.log("PASS omitted fact resolution: scoped fallback comparison + independent review + versioning; denied/timeout/forged target cannot revise history or report success");
