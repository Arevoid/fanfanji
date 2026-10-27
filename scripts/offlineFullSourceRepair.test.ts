import assert from "node:assert/strict";
import type {OfflineStory,Character,UserSettings} from "../src/types";
import type {KnowledgeClaim} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type {CharacterRelationship} from "../src/domain/relationship/characterRelationship";
import {rebuildOfflineStoryMemory,needsOfflineMemoryRepair} from "../src/features/offline/services/offlineMemoryRepair";
import {saveKnowledgeClaims,loadKnowledgeClaims} from "../src/core/storage/repositories/characterKnowledgeRepository";
import {saveOfflineStories,loadOfflineStories} from "../src/core/storage/repositories/offlineRepository";
import {saveMemories,loadMemories} from "../src/core/storage/repositories/memoryRepository";
import {loadConversationSummaries} from "../src/core/storage/repositories/conversationSummaryRepository";
import {readMemorySystem,MEMORY_SYSTEM_KEY} from "../src/core/storage/repositories/memorySystemRepository";
import {filterRecallableKnowledge} from "../src/features/characterKnowledge/services/characterContinuityService";
import {getOfflineMemorySourceMessages,getOfflineStorySummaryId,offlineMemorySourceRevision} from "../src/domain/memory/offlineMemorySync";
import {sourceRevision} from "../src/domain/characterKnowledge/knowledgeEvolution";
const values=new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}});
const character={id:"c",name:"C"} as Character;
const relationship={id:"r",characterId:"c",userIdentityId:"u",conversationId:"conv"} as CharacterRelationship;
const scope={characterId:"c",relationId:"r",userIdentityId:"u",conversationId:"conv"};
const base:OfflineStory={id:"story",characterId:"c",relationId:"r",ownerIdentityId:"u",conversationId:"conv",mode:"continue",title:"same-title",createdAt:1,updatedAt:1,
 archivedAt:2,lastSyncedMessageCount:4,lastMemorySyncAt:2,memorySyncStatus:"synced",messages:[
 {id:"offline-import-1",sender:"user",characterId:"c",timestamp:0,content:"IMPORTED SECRET",isImportedContext:true},
 ...[1,2,3].map(i=>({id:`m${i}`,sender:"user" as const,characterId:"c",timestamp:i,content:`BEGIN-${i}-`+"x".repeat(11_900)+`-TAIL-IMPORTANT-${i}`}))]};
const old={...scope,id:"old",statement:"TRUNCATED OLD SUMMARY",kind:"fact",subject:"user",truthStatus:"legacy_unverified",temporalStatus:"past",confidence:.25,userConfirmed:false,recordedAt:1,status:"active",visibility:"relation_private",schemaVersion:1,admissionStatus:"review",legacyCompatible:true,source:{kind:"offline_story",storyId:base.id,authorship:"unknown",producer:"legacy",evidenceKey:"old",sourceRecordId:"old-memory"}} as KnowledgeClaim;
let live:OfflineStory=base,calls:string[]=[],failSecond=true;
function reset(){values.clear();calls=[];live=structuredClone(base);saveOfflineStories([live,{...base,id:"other-story"}]);saveKnowledgeClaims([old,{...old,id:"other",statement:"OTHER STORY",source:{...old.source,storyId:"other-story"}}]);saveMemories([{id:"old-memory",...scope,content:`[offline-story:${base.id}:summary] OLD RAW`,timestamp:1,importance:4}]);values.set(MEMORY_SYSTEM_KEY,JSON.stringify({version:1,choice:"declined",hasLegacy:true}));}
const extract:NonNullable<Parameters<typeof rebuildOfflineStoryMemory>[0]["extractBatch"]>=async input=>{
 const msg=input.context.recentMessages[0];assert.notEqual(msg.id,"offline-import-1");calls.push(msg.id);
 if(msg.id==="m2"&&failSecond){failSecond=false;throw Error("synthetic 503");}
 const claim={...old,id:`new-${msg.id}`,statement:`TAIL-IMPORTANT-${msg.id.slice(1)}`,truthStatus:"asserted",admissionStatus:"retained",legacyCompatible:false,offlineArchiveManaged:true,
  source:{kind:"offline_story",storyId:base.id,authorship:"user",producer:"test",evidenceKey:msg.id,messageIds:[msg.id],messageRevisions:{[msg.id]:sourceRevision(msg.content)},evidenceQuote:`TAIL-IMPORTANT-${msg.id.slice(1)}`}} as KnowledgeClaim;
 return {acceptedClaims:[claim],extractedMemories:[],rejectedCandidateCount:0};
};
const input=()=>({story:live,participants:[{character,relationship}],settings:{apiKey:"synthetic",selectedModel:"synthetic"} as UserSettings,
 readLive:()=>live,persist:async(story:OfflineStory)=>{live=story;return saveOfflineStories([story,{...base,id:"other-story"}]).success;},extractBatch:extract});
reset();assert.equal(needsOfflineMemoryRepair(live),true);assert.equal(getOfflineMemorySourceMessages(live).length,0,"legacy cursor would otherwise skip every source");
await assert.rejects(rebuildOfflineStoryMemory(input()),/503/);
assert.equal(live.memoryRepair?.nextBatch,1);assert.equal(loadKnowledgeClaims().value.find(c=>c.id===old.id)?.status,"active");assert.equal(loadKnowledgeClaims().value.some(c=>c.id.startsWith("new-")),false,"staged facts must not leak into canonical recall");
assert.equal(loadMemories([]).value[0].recallDisabled,undefined);
const done=await rebuildOfflineStoryMemory(input());
assert.deepEqual(calls,["m1","m2","m2","m3"],"retry reuses the completed first batch");
assert.equal(done.memoryArchiveVersion,3);assert.equal(done.memoryRepair,undefined);assert.equal(needsOfflineMemoryRepair(done),false);
assert.equal(loadKnowledgeClaims().value.find(c=>c.id===old.id)?.status,"retracted");assert.equal(loadKnowledgeClaims().value.find(c=>c.id==="other")?.status,"active","same titles must never join separate stories");
const summary=loadConversationSummaries().value.find(s=>s.id===getOfflineStorySummaryId(base))!;assert.ok(summary.summary.includes("TAIL-IMPORTANT-3"));assert.equal(summary.sourceMessageIds.includes("offline-import-1"),false);
assert.equal(loadMemories([]).value[0].content.includes("OLD RAW"),true,"original legacy text is kept");assert.equal(loadMemories([]).value[0].recallDisabled,true);
assert.equal(filterRecallableKnowledge(loadKnowledgeClaims().value).some(c=>c.id===old.id),false);
assert.equal(readMemorySystem().value.choice,"declined","repair must not opt into global migration");
const count=calls.length;await rebuildOfflineStoryMemory(input());assert.equal(calls.length,count);assert.equal(getOfflineMemorySourceMessages(done).length,0);
const appended={...done,messages:[...done.messages,{...done.messages[1],id:"new",content:"NEW CONTENT",timestamp:5}]};assert.deepEqual(getOfflineMemorySourceMessages(appended).map(m=>m.id),["new"]);
const edited={...done,messages:done.messages.map(m=>m.id==="m2"?{...m,content:"EDITED"}:m)};assert.deepEqual(getOfflineMemorySourceMessages(edited).map(m=>m.id),["m2"]);
reset();failSecond=false;
await assert.rejects(rebuildOfflineStoryMemory({...input(),commit:()=>({success:false,error:"quota"})}),/保存失败/);
assert.equal(loadKnowledgeClaims().value.find(c=>c.id===old.id)?.status,"active");assert.equal(loadMemories([]).value[0].recallDisabled,undefined);
const beforeRetry=calls.length;await rebuildOfflineStoryMemory(input());assert.equal(calls.length,beforeRetry,"retry a failed atomic switch without model calls");
reset();const original=live.messages[1].content;
await assert.rejects(rebuildOfflineStoryMemory({...input(),extractBatch:async args=>{const result=await extract(args);live={...live,messages:live.messages.map(m=>m.id==="m1"?{...m,content:"CHANGED"}:m)};return result;}}),/来源已变化/);
assert.equal(loadKnowledgeClaims().value.find(c=>c.id===old.id)?.status,"active");assert.equal(loadConversationSummaries().value.length,0);
assert.notEqual(offlineMemorySourceRevision({...base.messages[1],content:original}),offlineMemorySourceRevision(live.messages[1]));
reset();await assert.rejects(rebuildOfflineStoryMemory({...input(),story:{...live,messages:[]}}),/原始/);assert.equal(loadKnowledgeClaims().value.find(c=>c.id===old.id)?.status,"active");
reset();failSecond=false;
const long="a".repeat(26_000)+"FINAL-TAIL-EVENT";live={...live,messages:[{...base.messages[1],content:long}]};saveOfflineStories([live]);
let fragments:string[]=[],fragmentCalls=0,failReview=true;
const longExtract:typeof extract=async args=>{
 const message=args.context.recentMessages[0],checkpoint=args.story.memoryArchiveWork?.[character.id];
 if(checkpoint?.extracted)return {acceptedClaims:checkpoint.candidates as KnowledgeClaim[],extractedMemories:[],rejectedCandidateCount:0};
 fragmentCalls++;fragments.push(message.content);
 const quote=message.content.includes("FINAL-TAIL-EVENT")?"FINAL-TAIL-EVENT":message.content.slice(0,20);
 const claim={...old,id:`fragment-${fragmentCalls}`,statement:quote,admissionStatus:"retained",truthStatus:"asserted",legacyCompatible:false,
  source:{...old.source,authorship:"user",messageIds:[message.id],messageRevisions:{[message.id]:sourceRevision(message.content)},evidenceQuote:quote,evidenceKey:`part-${fragmentCalls}`}} as KnowledgeClaim;
 if(fragmentCalls===2&&failReview){failReview=false;await args.persist({version:1,scope,sourceRevisions:{[message.id]:offlineMemorySourceRevision(message)},extracted:true,candidates:[claim],reviewedIds:[],skippedIds:[],failures:[],rejectedCandidateCount:0,valueSkippedCount:0});return {acceptedClaims:[],extractedMemories:[],rejectedCandidateCount:0,apiError:"review interrupted"};}
 return {acceptedClaims:[claim],extractedMemories:[],rejectedCandidateCount:0};
};
await assert.rejects(rebuildOfflineStoryMemory({...input(),extractBatch:longExtract}),/interrupted/);
assert.equal(live.memoryRepair?.nextBatch,1);await rebuildOfflineStoryMemory({...input(),extractBatch:longExtract});
assert.equal(fragmentCalls,3,"failed review reuses extracted fragment candidates");assert.equal(fragments.join(""),long,"every character including the tail reaches a durable batch");
assert.ok(loadConversationSummaries().value.some(s=>s.summary.includes("FINAL-TAIL-EVENT")));
assert.ok(loadKnowledgeClaims().value.filter(c=>c.id.startsWith("fragment-")).every(c=>c.source.messageRevisions?.m1===sourceRevision(long)),"fragment evidence is rebased to the full original source revision");
reset();failSecond=false;saveMemories(loadMemories([]).value.map(m=>({...m,recallDisabled:true})));
await assert.rejects(rebuildOfflineStoryMemory(input()),/有效记忆/);assert.equal(loadMemories([]).value[0].recallDisabled,true,"repair must not unpause a user-disabled legacy source");
reset();let deleted=false;await assert.rejects(rebuildOfflineStoryMemory({...input(),readLive:()=>{if(deleted)throw Error("story deleted");return live;},extractBatch:async args=>{const result=await extract(args);deleted=true;saveOfflineStories([]);return result;}}),/deleted/);
assert.equal(loadOfflineStories([]).value.length,0,"deleted stories must never be resurrected by a repair checkpoint");assert.equal(loadKnowledgeClaims().value.find(c=>c.id===old.id)?.status,"active");
reset();await assert.rejects(rebuildOfflineStoryMemory({...input(),participants:[{character:{...character,id:"foreign"},relationship:{...relationship,characterId:"foreign"}}]}),/来源/);assert.equal(calls.length,0,"foreign roles must not receive story text");
reset();live={...base,id:"group-story",characterId:"group",characterIds:["c","d"],relationId:undefined,conversationId:"group:group",messages:[{...base.messages[1],content:"GROUP-END"}]};saveOfflineStories([live]);
const second={id:"d",name:"D"} as Character,secondRelation={...relationship,id:"r-d",characterId:"d",conversationId:"conv-d"};
saveKnowledgeClaims([{...old,source:{...old.source,storyId:live.id}},{...old,...{characterId:"d",relationId:"r-d",conversationId:"conv-d"},id:"old-d",statement:"D OLD",source:{...old.source,storyId:live.id}}]);
let groupCalls:string[]=[],groupFailure=true;
const groupExtract:typeof extract=async args=>{
 groupCalls.push(args.scope.characterId);if(args.scope.characterId==="d"&&groupFailure){groupFailure=false;throw Error("group partial");}
 const message=args.context.recentMessages[0];return {acceptedClaims:[{...old,...args.scope,id:`group-new-${args.scope.characterId}`,statement:`${args.scope.characterId} GROUP-END`,admissionStatus:"retained",legacyCompatible:false,
  source:{kind:"offline_story",storyId:live.id,producer:"fixture",authorship:"user",evidenceKey:args.scope.characterId,messageIds:[message.id],messageRevisions:{[message.id]:sourceRevision(message.content)},evidenceQuote:"GROUP-END"}} as KnowledgeClaim],extractedMemories:[],rejectedCandidateCount:0};
};
const groupInput=()=>({...input(),participants:[{character,relationship},{character:second,relationship:secondRelation}],extractBatch:groupExtract});
await assert.rejects(rebuildOfflineStoryMemory(groupInput()),/group partial/);
assert.equal(loadKnowledgeClaims().value.every(c=>c.status==="active"),true,"one participant failure cannot cut over another participant early");
await rebuildOfflineStoryMemory(groupInput());assert.deepEqual(groupCalls,["c","d","d"]);
assert.equal(loadConversationSummaries().value.filter(s=>s.status==="active").length,2);assert.equal(loadKnowledgeClaims().value.filter(c=>c.id.startsWith("old")&&c.status==="active").length,0);
reset();
const beforeEmpty=JSON.stringify(loadKnowledgeClaims().value);
let emptyCalls=0;
const emptyExtract:typeof extract=async args=>{
 emptyCalls++;
 await args.persist({version:1,scope:args.scope,sourceRevisions:Object.fromEntries(args.context.recentMessages.map(m=>[m.id,offlineMemorySourceRevision(m)])),extracted:true,candidates:[],reviewedIds:[],skippedIds:[],failures:[],rejectedCandidateCount:0,valueSkippedCount:0});
 return {acceptedClaims:[],extractedMemories:[],rejectedCandidateCount:0};
};
await assert.rejects(rebuildOfflineStoryMemory({...input(),extractBatch:emptyExtract}),/未提取到可验证记忆/);
assert.equal(emptyCalls,1,"no automatic retry on empty results");
assert.equal(live.memoryRepair?.nextBatch,0);
assert.equal(live.memoryRepair?.checkpoint,undefined,"empty extraction must not permanently poison retries");
assert.equal(JSON.stringify(loadKnowledgeClaims().value),beforeEmpty,"empty rebuild cannot replace old claims");
assert.equal(loadMemories([]).value[0].recallDisabled,undefined);
await assert.rejects(rebuildOfflineStoryMemory({...input(),extractBatch:emptyExtract}),/未提取到可验证记忆/);
assert.equal(emptyCalls,2,"only an explicit second action requests the empty batch again");
console.log("PASS full-source offline repair: declined migration, legacy cursor bypass, tail coverage, isolated staging, resumable batches, atomic replacement/rollback, no duplicate model calls, source edits and missing originals, safe empty-result retry");
