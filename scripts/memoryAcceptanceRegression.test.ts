import assert from "node:assert/strict";
import { cleanAiReplyText } from "../src/features/chat/services/messageParser";
import { parseSubtitleText, getSubtitleContext } from "../src/features/cinema/subtitleParser";
import { reconcileOfflineSources } from "../src/domain/characterKnowledge/offlineSourceValidity";
import { sourceRevision } from "../src/domain/characterKnowledge/knowledgeEvolution";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { OfflineStory } from "../src/types";
import { createConversationSummaryRecord } from "../src/domain/characterKnowledge/conversationSummaryProjection";
import { loadConversationSummaries, saveConversationSummaries } from "../src/core/storage/repositories/conversationSummaryRepository";
import { installOfflineSourceReader } from "../src/core/storage/repositories/offlineRepository";
import { writeJson } from "../src/core/storage/storageAdapter";
import { storageKeys } from "../src/core/storage/storageKeys";
import { normalizeKnowledgeClaim } from "../src/domain/characterKnowledge/knowledgeWritePolicy";

for (const filter of [true, false]) {
  for (const text of ['我们刚才在海风灯塔，你给我一枚铜书签，上面刻着“逐光”。','我保管的是刻着“逐光”的铜书签。','这本书叫「旧伞铺」。'])
    assert.equal(cleanAiReplyText(text, filter), text);
  assert.equal(cleanAiReplyText('（轻笑）“你来了”', filter), filter ? '你来了' : '（轻笑）\n“你来了”');
}
const cues = parseSubtitleText('1\n00:00:01,000 --> 00:00:05,500\n整理杯子\n\n2\n00:00:06,000 --> 00:00:12,000\n重新开始学习', 'srt');
assert.equal(getSubtitleContext(cues, 0), '');
assert.match(getSubtitleContext(cues, 5000), /整理杯子/);
assert.doesNotMatch(getSubtitleContext(cues, 5000), /重新开始/);
assert.match(getSubtitleContext(cues, 12000), /重新开始/);

const story = {id:'story',ownerIdentityId:'user',characterId:'char',relationId:'rel',conversationId:'conv',messages:[
  {id:'edited',content:'钥匙由角色保管'}, {id:'independent',content:'钥匙由用户保管'}
]} as OfflineStory;
const claim: KnowledgeClaim = {id:'old',characterId:'char',relationId:'rel',userIdentityId:'user',conversationId:'conv',status:'active',truthStatus:'asserted',
  kind:'fact',subject:'relationship',statement:'钥匙由用户保管',temporalStatus:'past',confidence:1,userConfirmed:false,recordedAt:1,visibility:'relation_private',schemaVersion:1,
  source:{kind:'offline_story',authorship:'character',producer:'test',evidenceKey:'test',storyId:'story',messageIds:['edited'],evidenceQuote:'钥匙由用户保管',messageRevisions:{edited:sourceRevision('钥匙由用户保管')}}};
assert.equal(reconcileOfflineSources([claim],[story])[0].status,'retracted');
const revised = {...claim,id:'new',statement:'钥匙由角色保管',source:{...claim.source,evidenceQuote:'钥匙由角色保管',messageRevisions:{edited:sourceRevision('钥匙由角色保管')}}};
assert.deepEqual(reconcileOfflineSources([claim,revised],[story]).filter(c=>c.status==='active').map(c=>c.id),['new']);
assert.equal(reconcileOfflineSources([claim],[{...story,messages:[]}])[0].status,'retracted');
assert.equal(reconcileOfflineSources([claim],[{...story,ownerIdentityId:'other'}])[0].status,'active');
const independent = {...claim,source:{...claim.source,messageIds:['edited','independent'],evidenceGroups:[['edited'],['independent']],messageRevisions:{...claim.source.messageRevisions,independent:sourceRevision('钥匙由用户保管')}}};
assert.deepEqual(reconcileOfflineSources([independent],[story])[0].source.messageIds,['independent']);
assert.equal(reconcileOfflineSources(reconcileOfflineSources([claim,revised],[story]),[story]).filter(c=>c.status==='active').length,1);
// Exercise the actual repository read with an IndexedDB-hydrated live snapshot,
// not merely the pure policy or the obsolete localStorage story collection.
const memory = new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value),removeItem:(key:string)=>memory.delete(key)}});
Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:globalThis.localStorage}});
assert.ok(normalizeKnowledgeClaim(claim));
assert.equal(writeJson(storageKeys.characterKnowledgeClaims,[claim,revised]).success,true);
const staleSummary=createConversationSummaryRecord({id:'offline-story-summary:story:char',scope:{characterId:'char',relationId:'rel',userIdentityId:'user',conversationId:'conv'},claims:[claim,revised],sourceMessageIds:['edited'],generatedAt:5,layer:'episode'});
assert.ok(staleSummary);
assert.equal(saveConversationSummaries([staleSummary]).success,true);
const uninstall=installOfflineSourceReader(()=>[story]);
const currentSummary=loadConversationSummaries().value[0];
assert.doesNotMatch(currentSummary.summary,/钥匙由用户保管/);
assert.match(currentSummary.summary,/钥匙由角色保管/);
assert.deepEqual(currentSummary.sourceClaimIds,['new']);
assert.equal(currentSummary.generatedAt,5);
uninstall();
console.log('PASS memory acceptance regressions: quoted answers, watched subtitles, offline source revisions');
