import assert from "node:assert/strict";
import { completeVoiceCall } from "../src/features/chat/services/voiceCallCompletion";
import { getMessageEvidenceAuthor } from "../src/features/chat/prompts/messagePromptSerializer";
import { createDeterministicArtifactClaim } from "../src/features/characterKnowledge/services/deterministicKnowledgeCapture";
import { beginMemoryExtractionTask, finishMemoryExtractionTask, isMemoryExtractionTaskPending } from "../src/features/characterKnowledge/services/memoryExtractionTaskService";
const values=new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}}});
const scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"};
for(const callType of ["语音通话","视频通话"]){
 const {callRecord}=completeVoiceCall({requestedStatus:"completed",transcript:[{id:"u",sender:"user",content:"我一直害怕打雷。",timestamp:1},{id:"a",sender:"character",content:"我小时候住在海边。",timestamp:2}],durationSeconds:60,id:callType,characterId:"a",scope,sender:"user",timestamp:3,incoming:false,recentMessages:[],callType});
 assert.equal(getMessageEvidenceAuthor(callRecord,"我一直害怕打雷。"),"user");
 assert.equal(getMessageEvidenceAuthor(callRecord,"我小时候住在海边。"),"character","call initiator must not own character's statements");
 assert.equal(getMessageEvidenceAuthor(callRecord,"从未说过的话"),"unknown");
 assert.equal(createDeterministicArtifactClaim({message:callRecord,scope}),undefined,"duration alone is not durable memory");
 values.clear();
 const ordinary={...callRecord,id:"ordinary",content:"今天过得如何？"};
 const batch=beginMemoryExtractionTask(scope,[ordinary,callRecord],1000);assert.ok(batch);
 assert.equal(isMemoryExtractionTaskPending(scope,[callRecord],1001),false,"pending batch covers call worker");
 assert.equal(beginMemoryExtractionTask(scope,[callRecord],1001),undefined,"overlapping active source cannot acquire another lease");
 assert.equal(finishMemoryExtractionTask(batch,"completed"),true);
 assert.equal(isMemoryExtractionTaskPending(scope,[callRecord]),false,"completed batch covers call after restart");
 assert.equal(isMemoryExtractionTaskPending({...scope,relationId:"other"},[callRecord]),true,"other relationship cannot inherit task completion");
 assert.equal(isMemoryExtractionTaskPending(scope,[{...callRecord,content:callRecord.content+"修订"}]),true,"source revision creates new work");
}
console.log("PASS call archive: actual persisted voice/video transcript authorship, no duration fact, overlap lease, completed subset, scope and revision; deterministic only");
