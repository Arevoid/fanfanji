import assert from "node:assert/strict";
import { installOfflineSourceReader, saveOfflineStories } from "../src/core/storage/repositories/offlineRepository";
import { retrieveTruthForPrivatePrompt, formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { OfflineStory, Message } from "../src/types";

const values = new Map<string,string>();
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}});
const scope={characterId:"c",relationId:"r",userIdentityId:"u",conversationId:"conv"};
const msg=(id:string,content:string):Message=>({id,...scope,sender:"character",content,timestamp:999999});
const pocket=msg("pocket","角色先把铜书签收进口袋。"), box=msg("box","后来角色把铜书签放进蓝色铁盒锁好，钥匙由角色保管。");
const story={id:"story",...scope,ownerIdentityId:"u",title:"test",mode:"continue",createdAt:1,updatedAt:2,messages:[pocket,box]} as OfflineStory;
const claim=(message:Message,recordedAt:number):KnowledgeClaim=>({...scope,id:message.id,statement:message.content,kind:"fact",subject:"character",truthStatus:"confirmed",temporalStatus:"past",confidence:1,userConfirmed:true,status:"active",recordedAt,visibility:"relation_private",schemaVersion:1,
 source:{kind:"offline_story",authorship:"character",storyId:"story",messageIds:[message.id],quotedMessageId:message.id,evidenceQuote:message.content,producer:"test",evidenceKey:message.id}});
// Reprocessing the older event last must never reverse authored story order.
const claims=[claim(pocket,9000),claim(box,100)];
saveOfflineStories([{...story,messages:[pocket]}]);
let live:readonly OfflineStory[]=[story];
const removeReader=installOfflineSourceReader(()=>live);
const prompt=()=>formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({scope,claims,summaries:[],corrections:[],queryText:"铜书签最后在哪里，钥匙谁保管",limit:8,maxCharacters:8000}),{maxCharacters:8000,maxTokens:4000});
try {
 const text=prompt();
 assert.match(text,/剧情来源顺序：第1段/u);
 assert.match(text,/剧情来源顺序：第2段/u,"hydrated live story, not stale localStorage, supplies the second source position");
 assert.match(text,/先后状态变化不等于矛盾/u);
 assert.match(text,/计划和回忆/u);
 live=[{...story,messages:[pocket,msg("box","准备以后把铜书签放进蓝色铁盒。")]}];
 assert.doesNotMatch(prompt(),/剧情来源顺序：第2段/u,"edited source cannot lend its order to stale evidence");
 live=[{...story,messages:[pocket]}];
 assert.doesNotMatch(prompt(),/剧情来源顺序：第2段/u,"deleted source cannot lend an order");
 live=[{...story,ownerIdentityId:"foreign"}];
 assert.doesNotMatch(prompt(),/剧情来源顺序/u,"another identity cannot supply chronology");
 live=[];
 assert.doesNotMatch(prompt(),/剧情来源顺序/u,"an empty hydrated store must not fall back to stale localStorage");
} finally {removeReader();}
console.log("PASS offline source order: live-store precedence, reversed processing dates, source edits/deletes and identity isolation");
