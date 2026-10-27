import assert from "node:assert/strict";
import type {Character,OfflineStory,UserSettings,MemoryVaultSettings,Message} from "../src/types";
import type {CharacterRelationship} from "../src/domain/relationship/characterRelationship";
import type {KnowledgeClaim} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import {MemoryService} from "../src/domain/memory/MemoryService";
import {sourceRevision} from "../src/domain/characterKnowledge/knowledgeEvolution";
import {loadKnowledgeClaims,saveKnowledgeClaims} from "../src/core/storage/repositories/characterKnowledgeRepository";
import {loadConversationSummaries} from "../src/core/storage/repositories/conversationSummaryRepository";
import {pendingMemoryReviews} from "../src/features/characterKnowledge/services/memoryPendingReviewService";
import {createOfflineStoryMemorySyncActions} from "../src/features/offline/hooks/useOfflineStoryMemorySyncActions";
import {installOfflineArchiveExecutor} from "../src/features/offline/services/offlineArchiveQueue";
import {getOfflineMemorySourceMessages,offlineMemorySourceRevision} from "../src/domain/memory/offlineMemorySync";
const values=new Map<string,string>();Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}}});
const role={id:"c",name:"C",avatar:"",personality:"",backstory:""} as Character;
const relation={id:"r",characterId:"c",userIdentityId:"u",conversationId:"conv",relationship:"friend",createdAt:1,updatedAt:1} as CharacterRelationship;
let story={id:"review-story",characterId:"c",relationId:"r",ownerIdentityId:"u",conversationId:"conv",mode:"continue",title:"test",createdAt:1,updatedAt:1,syncedSourceMessageRevisions:{},messages:[1,2,3].map(i=>({id:`m${i}`,sender:"user",characterId:"c",timestamp:i,content:`SOURCE-${i}-`+"x".repeat(1300)}))} as OfflineStory;
const ref={current:story as OfflineStory|null};let extractionCalls=0;let fail=true;const reviewed:string[]=[];const original=MemoryService.extractMemoryBatches;
MemoryService.extractMemoryBatches=async context=>{extractionCalls++;return {extractedMemories:[],rejectedCandidateCount:0,acceptedClaims:context.recentMessages.map(message=>({id:`k-${message.id}`,characterId:"c",relationId:"r",userIdentityId:"u",conversationId:"conv",statement:`fact-${message.id}`,kind:"fact",subject:"user",truthStatus:"asserted",temporalStatus:"past",confidence:.85,userConfirmed:false,recordedAt:message.timestamp,status:"active",visibility:"relation_private",schemaVersion:1,admissionStatus:message.id==="m1"?"retained":"review",source:{kind:"offline_story",storyId:story.id,producer:"synthetic",authorship:"user",evidenceKey:message.id,messageIds:[message.id],messageRevisions:{[message.id]:sourceRevision(message.content)},evidenceQuote:message.content}} as KnowledgeClaim))};};
const stop=installOfflineArchiveExecutor(async value=>value,id=>id===story.id?story:undefined);
function actions(){return createOfflineStoryMemorySyncActions({characters:[role],relationships:[relation],settings:{name:"U",apiKey:"synthetic",selectedModel:"synthetic"} as UserSettings,memories:[],recallSettings:{} as MemoryVaultSettings,activeIdentityId:"u",activeStoryRef:ref,memorySyncInFlightRef:{current:new Set()},setMemorySyncingStoryId:()=>{},onSaveOfflineStory:async value=>{story=value;ref.current=value;return true;},onSaveMemories:()=>{},onSaveRelationships:()=>{},saveActiveStorySnapshot:value=>{story=value;ref.current=value;},showToast:()=>{},needsLegacyHandoffRepair:()=>false,needsMissingSummaryRepair:()=>false,needsUninformativeSummaryRepair:()=>false,
 requestMemoryReview:async request=>{const payload=JSON.parse(request.message!);assert.equal(payload.candidates.length,1);const candidate=payload.candidates[0];const id=candidate.sourceQuote.slice(7,8);reviewed.push(id);if(id==="2"&&fail)throw Error("HTTP 503 confidential-provider-body");return {text:JSON.stringify({reviews:[{id:candidate.id,sourceQuote:candidate.sourceQuote,decision:id==="3"?"uncertain":"new_experience",confidence:.99,reason:"synthetic evidence-bound review"}]})};}});}
try{
 const partial=await actions().handleSyncMemoryToBrain(story,{userConfirmed:true,syncIntent:"manual_settings",backgroundProgress:true});
 assert.equal(partial.memorySyncStatus,"synced");assert.equal(extractionCalls,1);assert.deepEqual(reviewed,[]);
 assert.equal(partial.memorySyncReport?.retained,1);assert.equal(partial.memorySyncReport?.review,2);assert.equal(partial.memorySyncReport?.failed,0);
 assert.equal(partial.lastMemorySyncError,undefined);assert.ok(!JSON.stringify(partial).includes("confidential-provider-body"));
 assert.deepEqual(getOfflineMemorySourceMessages(partial).map(m=>m.id),[]);
 assert.ok(loadConversationSummaries().value[0].summary.includes("fact-m1"));assert.ok(!loadConversationSummaries().value[0].summary.includes("fact-m3"));
 assert.equal(pendingMemoryReviews("u").length,0,"new offline review is not legacy migration work");
 fail=false;
 // A new factory simulates navigation/reload: only persisted work is reused.
 const completed=await actions().handleSyncMemoryToBrain(story,{userConfirmed:true,syncIntent:"manual_settings",backgroundProgress:true});
 assert.equal(completed.memorySyncStatus,"synced");assert.equal(Object.keys(story.memoryArchiveWork||{}).length,0,"finished checkpoint is cleared rather than resurrected by UI merge");assert.equal(extractionCalls,1,"review retry never re-extracts the transcript");assert.deepEqual(reviewed,[],"successful and legitimately uncertain judgments are not charged twice");
 assert.equal(getOfflineMemorySourceMessages(completed).length,0);assert.equal(loadConversationSummaries().value.length,1);
 const summary=loadConversationSummaries().value[0];assert.ok(summary.summary.includes("fact-m1")&&!summary.summary.includes("fact-m2"));assert.ok(!summary.summary.includes("fact-m3"));assert.equal(summary.sourceMessageRevisions?.m3,undefined,"uncertain content cannot be claimed as fully represented by formal facts");
 assert.equal(loadKnowledgeClaims().value.find(c=>c.id==="k-m2")?.admissionStatus,"review");
 assert.equal(loadKnowledgeClaims().value.find(c=>c.id==="k-m3")?.admissionStatus,"review");
 assert.equal(completed.syncedSourceMessageRevisions?.m2,offlineMemorySourceRevision(story.messages[1]));
 const previousCalls=extractionCalls;
 const old=loadKnowledgeClaims().value.find(claim=>claim.id==="k-m1")!;
 story={...story,id:"old-failure",messages:[story.messages[0]],memoryArchiveWork:undefined,memorySyncStatus:"failed",syncedSourceMessageRevisions:{},syncedSourceMessageIds:[],lastSyncedMessageCount:0,updatedAt:Date.now()};ref.current=story;
 saveKnowledgeClaims([{...old,id:"old-candidate",admissionStatus:"review",offlineArchiveManaged:undefined,source:{...old.source,storyId:story.id}}]);
 const recovered=await actions().handleSyncMemoryToBrain(story,{userConfirmed:true,syncIntent:"manual_settings",backgroundProgress:true});
 assert.equal(recovered.memorySyncStatus,"synced");assert.equal(extractionCalls,previousCalls,"pre-fix failures with verifiable candidates recover without extracting again");
 assert.equal(loadKnowledgeClaims().value.find(claim=>claim.id==="old-candidate")?.admissionStatus,"review");
 story={...story,id:"edited-source",messages:[{...story.messages[0],content:"edited source content"}],memoryArchiveWork:undefined,memorySyncStatus:"pending",syncedSourceMessageRevisions:{},syncedSourceMessageIds:[],lastSyncedMessageCount:0,updatedAt:Date.now()};ref.current=story;
 saveKnowledgeClaims([{...old,id:"stale-candidate",admissionStatus:"review",offlineArchiveManaged:undefined,source:{...old.source,storyId:story.id}}]);
 await actions().handleSyncMemoryToBrain(story,{userConfirmed:true,syncIntent:"manual_settings",backgroundProgress:true});
 assert.equal(extractionCalls,previousCalls+1,"source edits invalidate cached extraction and stale candidates are not trusted");
 console.log("PASS single-pass retained/uncertain archive, zero paid reviews across reloads, source coverage, legacy candidate reuse without promotion and source-edit invalidation; synthetic only");
}finally{MemoryService.extractMemoryBatches=original;stop();}
