import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planForumActivity } from "../src/features/forum/services/forumActivityService";
import { runAutomaticForumActivityCheck } from "../src/features/forum/services/forumActivityRuntime";
import { commitForumMutation, getForumSnapshotForIdentity } from "../src/core/storage/repositories/forumRepository";
import type { ForumThread, UserSettings } from "../src/types";
const values = new Map<string,string>();
const storage = { getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>values.set(key,value), removeItem:(key:string)=>values.delete(key) };
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:storage}});
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:storage});
const settings = { apiKey:"synthetic",selectedModel:"synthetic",apiEndpoint:"https://example.invalid/v1" } as UserSettings;
const thread:ForumThread={id:"t",ownerIdentityId:"u",publicAuthor:{displayName:"虚拟楼主",kind:"virtual",isAnonymous:false},
 title:"如何整理旧物",body:"想听听大家处理旧物的办法。",source:"ai-virtual",occurredAt:1,baseLikeCount:0,likedByIdentityIds:[],replyCount:0,createdAt:1,updatedAt:1};
let now=100, explicitCalls=0, backgroundCalls=0;
const context={ownerIdentityId:"u",relationships:[],characters:[],messages:[],memories:[],worldBookEntries:[],settings,now:()=>now};
const events=await planForumActivity({...context,trigger:"manual-thread-refresh",thread,replies:[],actorStates:[],now,
 aiCall:async()=>{explicitCalls++;return {text:JSON.stringify({events:[
 {localId:"a",actorSlot:"virtual-1",kind:"reply",body:"旧物整理时我会先按使用频率分类，再决定是否保留。",replyTo:{type:"thread"},delaySeconds:0},
 {localId:"b",actorSlot:"virtual-2",kind:"reply",body:"这个旧物整理办法挺实用，我也会先拍照留档。",replyTo:{type:"thread"},delaySeconds:30}
 ]})};}});
assert.equal(explicitCalls,1);assert.equal(events.length,2);
assert.ok(commitForumMutation({threads:[thread],activityTasks:[{id:"saved",ownerIdentityId:"u",threadId:"t",
 trigger:"manual-thread-refresh",status:"succeeded",startedAt:now,completedAt:now,pendingEvents:events,createdAt:now,updatedAt:now},
 {id:"failed",ownerIdentityId:"u",threadId:"t",trigger:"automatic",status:"failed",startedAt:0,completedAt:0,retryAfter:1,pendingEvents:[],createdAt:0,updatedAt:0}]}).success);
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{backgroundCalls++;throw Error("Background forum must never contact a provider");};
try {
 assert.equal((await runAutomaticForumActivityCheck(context)).released.length,1);
 now+=31_000;
 assert.equal((await runAutomaticForumActivityCheck(context)).released.length,1,"restore already generated delayed reply");
 for(let i=0;i<8;i++){now+=86400_000;assert.equal((await runAutomaticForumActivityCheck(context)).attempted,false);}
 assert.equal(backgroundCalls,0,"startup, overdue timers and failed legacy tasks never generate");
 assert.equal(getForumSnapshotForIdentity("u").replies.length,2);
 assert.equal((await runAutomaticForumActivityCheck({...context,ownerIdentityId:"other"})).released.length,0);
} finally {globalThis.fetch=originalFetch;}
const hook=readFileSync(new URL("../src/features/forumStory/hooks/useForumStoryScheduler.ts",import.meta.url),"utf8");
assert.match(hook,/enabled: false/,"entering forum cannot start paid story progression");
console.log("PASS forum startup/timer release-only, failed-task no retry, scoped restore and explicit generation");
