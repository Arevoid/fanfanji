import assert from "node:assert/strict";
import {MEMORY_GALLERY_CATEGORIES,memoryGalleryCategories,memoryGalleryEvidenceLabel,memoryGalleryDisplayText,relatedMemorySummaries} from "../src/domain/memory/memoryGallery";
import type {KnowledgeClaim,ConversationSummaryRecord} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
const claim:KnowledgeClaim={id:"event",characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c",statement:"一起参观了天文馆",kind:"fact",subject:"relationship",truthStatus:"confirmed",temporalStatus:"past",source:{kind:"offline_story",authorship:"system",producer:"synthetic",evidenceKey:"m",messageIds:["m"]},confidence:.9,userConfirmed:true,recordedAt:1,status:"active",visibility:"relation_private",schemaVersion:1};
assert.deepEqual(MEMORY_GALLERY_CATEGORIES.map(category=>category.id),["shared","plans","impressions","life","offline"]);
assert.equal(memoryGalleryDisplayText("- [推断/偏好] 用户喜欢看星星。"),"用户喜欢看星星。");
assert.equal(memoryGalleryDisplayText("[昨天]一起去了天文馆。"),"[昨天]一起去了天文馆。","ordinary brackets and time are not removed");
assert.deepEqual(memoryGalleryCategories(claim),["shared","offline"],"two views reference the same event, not two cloned records");
assert.deepEqual(memoryGalleryCategories({...claim,kind:"plan",temporalStatus:"future"}),["plans","offline"]);
assert.deepEqual(memoryGalleryCategories({...claim,supersedesId:"old-plan",planStatus:"completed",event:{activity:"参观天文馆",state:"completed",referenceClaimId:"old-plan"}}),["shared","offline"],"completed plans remain in shared history, not future plans");
assert.deepEqual(memoryGalleryCategories({...claim,supersedesId:"old-plan",planStatus:"cancelled"}),["shared","offline"],"cancelled plans are historical records, not future arrangements");
assert.deepEqual(memoryGalleryCategories({...claim,admissionStatus:"review"}),[]);
assert.deepEqual(memoryGalleryCategories({...claim,truthStatus:"legacy_unverified"}),[]);
assert.deepEqual(memoryGalleryCategories({...claim,source:{...claim.source,app:"diary"}}),[]);
assert.equal(memoryGalleryEvidenceLabel({...claim,kind:"hypothesis",truthStatus:"inferred"}),memoryGalleryEvidenceLabel(claim));
for(const state of [{admissionStatus:"review" as const},{truthStatus:"disputed" as const}]){
 assert.equal(memoryGalleryEvidenceLabel({...claim,...state}),memoryGalleryEvidenceLabel(claim),"internal review state must not appear in provenance labels");
}
assert.equal(memoryGalleryDisplayText("[推测] TA觉得你喜欢下雨。\n[待核实] 一段经历。"),"TA觉得你喜欢下雨。\n一段经历。");
const summary={...claim,id:"summary",summary:claim.statement,sourceClaimIds:[claim.id],sourceMessageIds:["m"],generatedAt:1,generator:"synthetic",projectionVersion:2} as unknown as ConversationSummaryRecord;
assert.equal(relatedMemorySummaries(claim,[summary,{...summary,id:"foreign",relationId:"other"}]).length,1);
console.log("PASS gallery: shared references, plans, impressions, experiences, legacy exclusion, diary boundary and scoped summaries");
