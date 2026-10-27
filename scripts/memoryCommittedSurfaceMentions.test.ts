import assert from "node:assert/strict";
import {saveMessages} from "../src/core/storage/repositories/messageRepository";
import {saveCoReadingStore} from "../src/core/storage/repositories/readingCoReadingRepository";
import {saveCinemaStore} from "../src/core/storage/repositories/cinemaRepository";
import {saveDiaryEntries} from "../src/core/storage/repositories/diaryRepository";
import {saveCharacters} from "../src/core/storage/repositories/characterRepository";
import {saveOfflineStories} from "../src/core/storage/repositories/offlineRepository";
import {createEmptyCoReadingStore,DEFAULT_READING_ROOM_SETTINGS} from "../src/domain/reading/coReadingTypes";
import {loadCommittedMemoryReplyTurns} from "../src/features/characterKnowledge/services/memoryReplySources";
import {observeMemoryMentions} from "../src/features/characterKnowledge/services/memoryMentionService";
import {loadMemoryMentions,recentlyMentioned} from "../src/core/storage/repositories/memoryMentionRepository";
import {buildMemoryContext} from "../src/features/characterKnowledge/services/memoryContextGateway";
import {saveKnowledgeClaims,loadKnowledgeClaims} from "../src/core/storage/repositories/characterKnowledgeRepository";
import type {Character,UserSettings,OfflineStory} from "../src/types";
import type {KnowledgeClaim} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
const values=new Map<string,string>();
Object.defineProperty(globalThis,"document",{configurable:true,value:{visibilityState:"visible"}});
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}});
const now=Date.now(),scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"};
const statement="用户害怕打雷";
const raw={...scope,id:"fear",statement,kind:"fact",subject:"user",temporalStatus:"present",truthStatus:"asserted",confidence:.9,userConfirmed:false,status:"active",visibility:"relation_private",schemaVersion:1,recordedAt:now-5000,source:{kind:"user_message",authorship:"user",producer:"synthetic",evidenceKey:"source",messageIds:["source"]}} as KnowledgeClaim;
saveKnowledgeClaims([raw]);const claim=loadKnowledgeClaims().value[0];
const readingScope={...scope,bookId:"book",readingRoomId:"reading-room"};
const reading={...createEmptyCoReadingStore(),rooms:[{...readingScope,id:"reading-room",status:"active" as const,characterSnapshot:{characterId:"a",name:"角色"},settings:DEFAULT_READING_ROOM_SETTINGS,invitedAt:1,createdAt:1,updatedAt:1}],
 discussions:[{...readingScope,id:"talk",status:"open" as const,userPrompt:"打雷",createdAt:now-4000,updatedAt:now-3000}],
 discussionMessages:[{...readingScope,id:"reading-ai",discussionId:"talk",author:"ai" as const,authorName:"角色",body:statement,source:"known" as const,createdAt:now-3000}]};
assert.ok(saveCoReadingStore(reading).success);
const cinema={schemaVersion:1 as const,media:[],rooms:[{...scope,id:"room",mediaId:"film",createdAt:1,updatedAt:1,positionMs:0,watchedUntilMs:0,autoReactionEnabled:false}],discussions:[{...scope,id:"movie",roomId:"room",mediaId:"film",positionMs:0,userText:"打雷",characterText:statement,createdAt:now-2000}]};
assert.ok(saveCinemaStore(cinema));
let turns=(await loadCommittedMemoryReplyTurns(scope,"conversation",now))!;
assert.deepEqual(turns.map(t=>t.id),["reading:reading-ai","cinema:movie"]);
observeMemoryMentions({scope,claims:[claim],turns,now});assert.ok(recentlyMentioned(claim,now));
assert.equal((await loadCommittedMemoryReplyTurns({...scope,userIdentityId:"foreign"},"conversation",now))!.length,0);
assert.ok(saveCoReadingStore({...reading,discussionMessages:reading.discussionMessages.map(row=>({...row,body:"今天聊点别的"}))}).success);
assert.ok(saveCinemaStore({...cinema,discussions:[]}));
await loadCommittedMemoryReplyTurns(scope,"conversation",now);assert.equal(loadMemoryMentions().value.length,0,"edited and deleted saved outputs retract their mention classifications");
saveMessages([{...scope,id:"recalled",content:statement,timestamp:now-1000,sender:"character",recalledAt:now-500}]);
assert.ok(!(await loadCommittedMemoryReplyTurns(scope,"conversation",now))!.some(t=>t.id==="chat:recalled"));
assert.ok(saveDiaryEntries([{id:"diary",ownerIdentityId:"u",authorType:"character",characterId:"a",relationId:"r",conversationId:"c",authorNameSnapshot:"角色",body:statement,tags:[],occurredAt:now-1000,createdAt:now-1000,updatedAt:now-1000,source:"ai-auto",isFavorite:false}]).success);
const relation={id:"r",characterId:"a",userIdentityId:"u",conversationId:"c",relationship:"friend" as const,createdAt:1,updatedAt:1};
const diary=await buildMemoryContext({surface:"diary",relation,characterId:"a",userIdentityId:"u",query:"打雷",settings:{} as UserSettings,audience:"relation_private"});
assert.match(diary,/不代表已告诉用户/);assert.ok(recentlyMentioned(claim,now,undefined,"diary"));assert.equal(recentlyMentioned(claim,now),false,"private journal is not a conversation disclosure");
saveCharacters([{id:"group",isGroupChat:true,ownerIdentityId:"u",memberIds:["contact"]},{id:"contact",profileSourceId:"a"}] as Character[]);
saveMessages([{id:"group-reply",characterId:"group",senderId:"contact",content:statement,timestamp:now-1000,sender:"character"}]);
turns=(await loadCommittedMemoryReplyTurns(scope,"group:group",now))!;assert.equal(turns[0]?.id,"group:group:group-reply");
observeMemoryMentions({scope,claims:[claim],turns,now,channel:"group:group"});
assert.ok(recentlyMentioned(claim,now,undefined,"group:group"));assert.equal(recentlyMentioned(claim,now,undefined,"group:other"),false);
saveCharacters([{id:"group",isGroupChat:true,ownerIdentityId:"u",memberIds:[]}] as Character[]);
await loadCommittedMemoryReplyTurns(scope,"group:group",now);assert.equal(recentlyMentioned(claim,now,undefined,"group:group"),false,"revoked group membership removes channel evidence");
saveOfflineStories([{...scope,id:"story",title:"隔离测试",mode:"if",ownerIdentityId:"u",characterIds:["a"],createdAt:1,updatedAt:now,messages:[
 {id:"story-output",characterId:"a",sender:"character",content:statement,timestamp:now-1000},
 {id:"imported",characterId:"a",sender:"character",content:"导入原文",timestamp:now-900,isImportedContext:true},
]} as OfflineStory]);
turns=(await loadCommittedMemoryReplyTurns(scope,"offline:story",now))!;assert.deepEqual(turns.map(t=>t.id),["offline:story:story-output"]);
observeMemoryMentions({scope,claims:[claim],turns,now,channel:"offline:story"});assert.ok(recentlyMentioned(claim,now,undefined,"offline:story"));
assert.equal(recentlyMentioned(claim,now),false);assert.equal(recentlyMentioned(claim,now,undefined,"offline:other"),false);
assert.equal((await loadCommittedMemoryReplyTurns({...scope,userIdentityId:"foreign"},"offline:story",now))!.length,0);
saveOfflineStories([]);await loadCommittedMemoryReplyTurns(scope,"offline:story",now);assert.equal(recentlyMentioned(claim,now,undefined,"offline:story"),false);
console.log("PASS committed surface mentions: canonical reading/cinema, no recalled reply, edit/delete reconciliation, exact relation, diary isolation, group contact ID mapping and membership revocation; no provider calls");
