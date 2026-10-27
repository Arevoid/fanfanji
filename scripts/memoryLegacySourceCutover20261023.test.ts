import assert from "node:assert/strict";
import {finalizeLegacySourceCutover,organizationSourceRevision} from "../src/domain/characterKnowledge/knowledgeOrganization";
import type {KnowledgeClaim} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import {filterRecallableKnowledge} from "../src/features/characterKnowledge/services/characterContinuityService";
const parent={id:"old",characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c",statement:"过去的完整经历",kind:"fact",subject:"user",truthStatus:"legacy_unverified",temporalStatus:"past",status:"active",confidence:.25,userConfirmed:false,recordedAt:1,admissionStatus:"review",legacyCompatible:true,organizationOriginal:true,source:{kind:"legacy_memory",authorship:"unknown",producer:"fixture",evidenceKey:"old",sourceRecordId:"old"}} as KnowledgeClaim;
const child={...parent,id:"child",statement:"提炼出的重点",organizationOriginal:false,legacyCompatible:false,organizationSourceId:parent.id,organizationSourceRevision:organizationSourceRevision(parent),admissionStatus:"retained"} as KnowledgeClaim;
const processed={[parent.id]:organizationSourceRevision(parent)};
assert.equal(finalizeLegacySourceCutover([parent,child],{},new Set())[0].legacyCompatible,true,"partial source keeps the old compatible view");
const finished=finalizeLegacySourceCutover([parent,child],processed,new Set([parent.id]));assert.equal(finished[0].legacyCompatible,false,"stale parent review status must not prevent approved children from replacing the archive");assert.equal(finished[0].admissionStatus,"review","archived parent never becomes a newly approved whole-source fact");assert.equal(finished[0].statement,parent.statement);assert.equal(finished[1].truthStatus,"legacy_unverified");
assert.deepEqual(filterRecallableKnowledge([parent,child]).map(c=>c.id),[parent.id],"before cutover the compatible source is used once");
assert.deepEqual(filterRecallableKnowledge(finished).map(c=>c.id),[child.id],"after cutover only the approved derived record is recalled");
assert.equal(finalizeLegacySourceCutover([parent,{...child,admissionStatus:"review"}],processed,new Set())[0].legacyCompatible,true);
assert.equal(finalizeLegacySourceCutover([parent,child],processed,new Set([child.id]))[0].legacyCompatible,true,"semantic conflicts stay held even when value is approved");
assert.equal(finalizeLegacySourceCutover([{...parent,admissionStatus:"skipped"},child],processed,new Set())[0].legacyCompatible,false,"a usable complete replacement must not be suppressed by a stale parent filter flag");
assert.equal(finalizeLegacySourceCutover([parent],processed,new Set())[0].legacyCompatible,true,"missing derived records are not proof of a discard");
assert.equal(finalizeLegacySourceCutover([parent,{...child,admissionStatus:"skipped"}],processed,new Set())[0].legacyCompatible,true);
const recovered=finalizeLegacySourceCutover([{...parent,legacyCompatible:false,admissionStatus:"skipped"},{...child,admissionStatus:"skipped"}],processed,new Set());
assert.equal(recovered[0].admissionStatus,"review");
assert.deepEqual(filterRecallableKnowledge(recovered).map(c=>c.id),[parent.id],"filtered source remains recallable exactly once when no usable replacement exists");
assert.equal(recovered[0].truthStatus,parent.truthStatus);
assert.equal(recovered[0].confidence,parent.confidence);
assert.equal(recovered[0].statement,parent.statement);
assert.equal(finalizeLegacySourceCutover(recovered,processed,new Set())[0].admissionStatus,"review","repair is idempotent");
for(const blocked of [{status:"retracted" as const},{recallDisabled:true},{supersededById:"new"},{intervention:{kind:"manual_edit"} as any}]){
 const old={...parent,legacyCompatible:false,admissionStatus:"skipped" as const,...blocked};
 assert.deepEqual(finalizeLegacySourceCutover([old],processed,new Set())[0],old,"explicit user/lifecycle exclusions must never be restored");
}
console.log("PASS legacy cutover: complete approved children replace old view; partial/review/missing sources retain compatibility, no authority upgrade and explicit filtering stays filtered");
