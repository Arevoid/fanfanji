import assert from "node:assert/strict";
import {MemoryService} from "../src/domain/memory/MemoryService";
import {saveKnowledgeClaims,loadKnowledgeClaims} from "../src/core/storage/repositories/characterKnowledgeRepository";
import {contributeSemanticDirectReplyTruthContext} from "../src/features/characterKnowledge/services/semanticMemoryRecallService";
import {formatTruthRetrievalForPrompt} from "../src/features/characterKnowledge/services/truthRetrievalService";
import type {Character} from "../src/types";
const storage=new Map<string,string>();Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)}}});
const scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"};
const content="我一直害怕打雷，请记住这件事。";let ids=0;
const extraction=await MemoryService.extractMemories({...scope,character:{id:"a",name:"验收"} as Character,recentMessages:[{...scope,id:"m",content,sender:"user",timestamp:100}],existingMemories:[],scenario:"chat",apiKey:"synthetic-chat-only",model:"synthetic",createId:()=>`extracted-${++ids}`,currentTime:()=>200,formatContent:rows=>rows.join("\n")},async()=>({candidates:[{statement:content,evidenceQuote:content,sourceMessageIds:["m"],kind:"fact",subject:"user",temporalStatus:"present",valueAssessment:{quote:content,impact:3,durability:3,novelty:2,confidence:.95,reason:"持续恐惧与明确记忆请求",explicitRemember:true}}]}));
assert.equal(extraction.acceptedClaims.length,1);assert.equal(saveKnowledgeClaims(extraction.acceptedClaims).success,true);
const reloaded=loadKnowledgeClaims();assert.equal(reloaded.valid,true);
let vectorRequests=0;
const retrieval={scope,claims:reloaded.value,summaries:[],corrections:[],queryText:"打雷",now:1000,limit:300,unboundedMemory:true};
for(const configuration of [undefined,{enabled:false,apiEndpoint:"",model:"",apiKey:""}]){
 const recalled=await contributeSemanticDirectReplyTruthContext({configuration,visible:true,retrieval,request:async()=>{vectorRequests++;throw Error("must never request vectors");}});
 assert.match(formatTruthRetrievalForPrompt(recalled),/一直害怕打雷/);
}
assert.equal(vectorRequests,0);
const unrelated=await contributeSemanticDirectReplyTruthContext({retrieval:{...retrieval,queryText:"帮我计算四则运算"},visible:true});
assert.doesNotMatch(formatTruthRetrievalForPrompt(unrelated),/一直害怕打雷/);
console.log("PASS no-embedding pipeline: extract, value admission, durable save/reload, relevant recall and prompt; zero vector requests, unrelated query stays empty (extraction model synthetic)");
