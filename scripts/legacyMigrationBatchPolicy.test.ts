import assert from "node:assert/strict";
import { legacyMigrationContentKey, legacyMigrationOutputTokens } from "../src/domain/memory/legacyMigrationBatchPolicy";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
const claim:KnowledgeClaim={id:"a",characterId:"c",userIdentityId:"u",relationId:"r",conversationId:"conv",statement:"用户保存母亲的明信片。",
 kind:"fact",subject:"user",temporalStatus:"past",truthStatus:"legacy_unverified",confidence:.25,userConfirmed:false,status:"active",
 visibility:"relation_private",schemaVersion:1,recordedAt:1,source:{kind:"legacy_memory",authorship:"unknown",producer:"old",evidenceKey:"a",sourceRecordId:"a"}};
assert.equal(legacyMigrationContentKey(claim),legacyMigrationContentKey({...claim,id:"b",source:{...claim.source,evidenceKey:"b",sourceRecordId:"b"}}));
for(const change of [{characterId:"other"},{userIdentityId:"other"},{relationId:"other"},{conversationId:"other"},
 {occurredAt:100},{confidence:.5},{truthStatus:"asserted" as const},{subject:"character" as const},{temporalStatus:"future" as const},
 {source:{...claim.source,authorship:"user" as const}},{source:{...claim.source,statementAt:100}}])
 assert.notEqual(legacyMigrationContentKey(claim),legacyMigrationContentKey({...claim,...change}),"different scope/authority/time cannot share analysis");
assert.notEqual(legacyMigrationContentKey(claim),legacyMigrationContentKey(claim,10),"different fragment progress cannot share decisions");
assert.equal(legacyMigrationOutputTokens(20,6000),8192);
assert.equal(legacyMigrationOutputTokens(60,24000),16384);
console.log("PASS migration text-analysis reuse is scope, authority, time and offset isolated; bounded output budgets");
