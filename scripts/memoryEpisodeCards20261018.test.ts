import assert from "node:assert/strict";
import {buildMemoryEpisodeCards} from "../src/domain/memory/memoryEpisodeCards";
import {buildMemoryCenterRecords} from "../src/domain/memory/memoryCenterModel";
import {restoreFullMemoryQuote} from "../src/domain/memory/memoryLiteralQuote";
import {classifyMemoryOrganizationFailure} from "../src/features/characterKnowledge/services/memoryOrganizationFailure";
import {normalizeConversationSummaries} from "../src/core/storage/repositories/conversationSummaryRepository";
import type {KnowledgeClaim,ConversationSummaryRecord} from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"};
const claim:KnowledgeClaim={...scope,id:"fear",statement:"用户一直害怕打雷。",kind:"fact",subject:"user",truthStatus:"asserted",temporalStatus:"present",confidence:.99,userConfirmed:false,recordedAt:1,status:"active",visibility:"relation_private",schemaVersion:1,admissionStatus:"retained",source:{kind:"user_message",authorship:"user",producer:"synthetic",evidenceKey:"m1",messageIds:["m1"],evidenceQuote:"我一直害怕打雷。"}};
const claims=[claim,{...claim,id:"plan",statement:"约好下周一起看星星。",kind:"plan" as const,temporalStatus:"future" as const,recordedAt:2,source:{...claim.source,messageIds:["m40"]}},
 {...claim,id:"junk",statement:"好帅好帅好帅",admissionStatus:"review" as const},
 {...claim,id:"later",statement:"后来一起去了天文馆。",recordedAt:3},
 {...claim,id:"foreign",relationId:"other",statement:"另一关系的秘密。",recordedAt:4}];
const summary:ConversationSummaryRecord={...scope,id:"twenty-rounds",summary:"不得把旧摘要的无意义原文塞进新卡片",sourceClaimIds:["fear","plan","junk"],sourceMessageIds:Array.from({length:40},(_,i)=>`m${i+1}`),generatedAt:10,generator:"conversation-episode.v2",layer:"episode",projectionVersion:2,status:"active",schemaVersion:1};
const summaries=[summary,{...summary,id:"all-history",layer:"projection" as const,sourceClaimIds:claims.map(c=>c.id)},
 {...summary,id:"foreign-window",relationId:"other",sourceClaimIds:["fear","foreign"]}];
const persisted=normalizeConversationSummaries([summary,{...summary,id:"background",layer:"projection",generatedAt:20},{...summary,id:"next-window",generatedAt:30}]);
assert.equal(persisted.length,3,"same text cannot collapse an episode into a background projection or another archive window");
const revisedEpisode=normalizeConversationSummaries([summary,{...summary,summary:"更新后的本批次内容",sourceClaimIds:["plan"],generatedAt:40}]);
assert.equal(revisedEpisode.length,1);assert.deepEqual(revisedEpisode[0].sourceClaimIds,["plan"],"stable episode retry replaces stale support instead of accumulating duplicate records");
const build=(current=claims)=>buildMemoryEpisodeCards({claims:current,summaries,records:buildMemoryCenterRecords({claims:current,summaries,memories:[],corrections:[]})}).filter(row=>row.recordType==="truth");
const cards=build();assert.equal(cards.length,3,"one archive-window card plus later independent event and separate relationship");
const batch=cards.find(card=>card.memberClaimIds.includes("fear"))!;
assert.deepEqual(batch.memberClaimIds,["fear","plan"]);
assert.deepEqual(batch.categoryIds,["shared","plans"]);
assert.match(batch.content,/你一直害怕打雷/);assert.match(batch.content,/约好下周/);
assert.ok(!cards.some(card=>card.content.includes("好帅")||card.content.includes("旧摘要")));
assert.ok(!batch.memberClaimIds.includes("foreign")&&!batch.memberClaimIds.includes("later"),"cumulative projection and foreign window cannot merge episodes");
assert.equal(claims.length,5,"presentation never merges or deletes independently editable canonical facts");
const edited=build(claims.map(c=>c.id==="fear"?{...c,statement:"用户已不再害怕打雷。"}:c)).find(card=>card.memberClaimIds.includes("fear"))!;
assert.match(edited.content,/已不再害怕/);assert.ok(!edited.content.includes("一直害怕"),"render current fact rather than stale summary text");
assert.equal(restoreFullMemoryQuote("我不喜欢咖啡。","我不喜欢咖啡"),"我不喜欢咖啡。");
assert.equal(restoreFullMemoryQuote("第一行\r\n第二行","第一行\n第二行"),"第一行\r\n第二行");
for(const quote of ["我喜欢咖啡。","我不喜欢咖啡？","我不喜欢咖啡……"]){assert.notEqual(restoreFullMemoryQuote("我不喜欢咖啡。",quote),"我不喜欢咖啡。");}
assert.equal(classifyMemoryOrganizationFailure({status:429}).code,"quota");
assert.equal(classifyMemoryOrganizationFailure({status:502,code:"provider_invalid_response"}).code,"invalid_response");
assert.equal(classifyMemoryOrganizationFailure(new SyntaxError("private response must not persist")).code,"invalid_response");
assert.equal(classifyMemoryOrganizationFailure({status:503}).code,"provider_unavailable");
console.log("PASS archive episode view: 20-round window, atomic facts preserved, no pending junk, scope/projection boundaries, current edits, literal evidence and distinct API failures");
