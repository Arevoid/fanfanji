import assert from "node:assert/strict";
import type {Character,OfflineStory,UserSettings} from "../src/types";
import {extractOfflineArchiveWithCheckpoint} from "../src/features/offline/services/offlineArchiveExtraction";
import {apiExtractMemories,apiExtractMemoriesWithModelFallback} from "../src/utils/apiHelper";
import {MemoryService} from "../src/domain/memory/MemoryService";
import {MEMORY_EXTRACTION_CAPACITY_ERROR} from "../src/domain/memory/memoryExtractionCapacity";
const values=new Map<string,string>();Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}});
const scope={characterId:"c",relationId:"r",userIdentityId:"u",conversationId:"conv"};
const character={id:"c",name:"C",personality:"性格温柔"} as Character;
const message={id:"m1",characterId:"c",sender:"user" as const,content:"我喜欢周末喝咖啡。",timestamp:1};
let story={id:"story",...scope,ownerIdentityId:"u",mode:"continue",title:"test",messages:[message],createdAt:1,updatedAt:1} as OfflineStory;
const settings={apiKey:"synthetic",apiEndpoint:"https://example.invalid/v1",selectedModel:"test-model"} as UserSettings;
let requests:any[]=[],reviews=0,registries=0,ids=0;
const context={...scope,character,recentMessages:[message],existingMemories:[],existingClaims:[],scenario:"offline" as const,
 apiKey:settings.apiKey,apiEndpoint:settings.apiEndpoint,model:settings.selectedModel,requireFactResolution:true,
 prepareSemanticRegistry:async()=>{registries++;return [];},reviewAuthorizedSettings:async()=>{reviews++;throw Error("unexpected paid review");},
 offlineStoryPolicyInput:{story,userConfirmed:true,syncIntent:"manual_settings" as const,sourceMessages:[message]},
 createId:()=>`candidate-${++ids}`,currentTime:()=>1,formatContent:(items:readonly string[])=>items.join("\n")};
const candidate=(decision="new_experience")=>({statement:"用户喜欢周末喝咖啡。",kind:"preference",subject:"user",temporalStatus:"present",sourceMessageIds:[message.id],evidenceQuote:message.content,
 valueAssessment:{quote:message.content,impact:1,durability:2,novelty:1,confidence:.99,reason:"稳定偏好"},settingReview:{decision,confidence:.99,reason:"原文明示的用户偏好"}});
const originalFetch=globalThis.fetch;
const run=()=>extractOfflineArchiveWithCheckpoint({story,character,scope,settings,context,extractApi:apiExtractMemories,readClaims:()=>[],
 reviewRequest:async()=>{reviews++;throw Error("unexpected second call");},persist:async work=>{story={...story,memoryArchiveWork:{c:work}};}});
try{
 globalThis.fetch=(async(url,init)=>{requests.push({url:String(url),body:JSON.parse(String(init?.body))});return Response.json({text:JSON.stringify(candidate())});}) as typeof fetch;
 const result=await run();assert.equal(result.apiError,undefined);assert.equal(result.acceptedClaims.length,1);assert.equal(result.acceptedClaims[0].admissionStatus,"retained");
 assert.equal(requests.length,1);assert.equal(reviews,0);assert.equal(registries,0);assert.equal(requests[0].url,"/api/chat");
 assert.ok(requests[0].body.message.includes("单次整理"));assert.ok(!requests[0].body.message.includes(character.personality),"unrelated persona must not be copied into extraction");assert.equal("singleAttempt" in requests[0].body,false);
 assert.ok(requests[0].body.message.includes(message.content),"source message is sent unchanged, never scrubbed to evade provider review");
 await run();assert.equal(requests.length,1,"a durable checkpoint is reused without any model call");
 story={...story,memoryArchiveWork:undefined};requests=[];
 globalThis.fetch=(async()=>{requests.push({});return Response.json({text:JSON.stringify(candidate("uncertain"))});}) as typeof fetch;
 const uncertain=await run();assert.equal(uncertain.acceptedClaims[0].admissionStatus,"review");assert.equal(requests.length,1);assert.equal(reviews,0,"uncertainty never invokes an independent reviewer");
 story={...story,memoryArchiveWork:undefined};requests=[];
 globalThis.fetch=(async()=>{requests.push({});return Response.json({text:JSON.stringify({...candidate("duplicate_setting"),settingReview:{decision:"duplicate_setting",settingQuote:123,confidence:.99,reason:"invalid setting quote"}})});}) as typeof fetch;
 const malformedSetting=await run();assert.equal(malformedSetting.acceptedClaims[0].admissionStatus,"review");assert.equal(requests.length,1,"malformed judgments stay uncertain without crashing or retrying");
 story={...story,memoryArchiveWork:undefined};requests=[];
 globalThis.fetch=(async()=>{requests.push({});return Response.json({text:JSON.stringify({...candidate(),sourceMessageIds:["another-role-message"]})});}) as typeof fetch;
 assert.ok((await run()).apiError);assert.equal(requests.length,1,"foreign evidence is rejected locally without a repair request");
 for(const response of [()=>Response.json({text:"malformed provider prose"}),()=>Response.json({error:"blocked"},{status:502}),()=>new Response("<html>static host</html>",{status:404,headers:{"content-type":"text/html"}})]){
  story={...story,memoryArchiveWork:undefined};requests=[];globalThis.fetch=(async()=>{requests.push({});return response();}) as typeof fetch;
  const failed=await run();assert.ok(failed.apiError);assert.equal(requests.length,1,"invalid format, upstream errors and missing routes cannot trigger another paid attempt");
 }
 story={...story,memoryArchiveWork:undefined};requests=[];globalThis.fetch=(async()=>{requests.push({});throw new TypeError("Failed to fetch");}) as typeof fetch;
 assert.ok((await run()).apiError);assert.equal(requests.length,1,"ambiguous network failure must not fall back to a second transport");
 let fallbacks=0;await apiExtractMemoriesWithModelFallback({...context,history:[{id:"m1",role:"user",text:message.content}],characterName:"C",singlePass:true},"other-model",async()=>{fallbacks++;return {text:"",items:[],error:"unavailable"};});assert.equal(fallbacks,1);
 let capacityCalls=0;await MemoryService.extractMemoryBatches({...context,singlePass:true,recentMessages:[message,{...message,id:"m2"}]},async()=>{capacityCalls++;return {error:MEMORY_EXTRACTION_CAPACITY_ERROR};});assert.equal(capacityCalls,1,"capacity errors do not silently split and retry");
 console.log("PASS offline single pass: one real transport request, inline value/settings, strict sources, checkpoint reuse, zero ancillary calls or automatic repair/fallback/capacity retries");
}finally{globalThis.fetch=originalFetch;}
