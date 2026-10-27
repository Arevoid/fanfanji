import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { evolveKnowledgeClaims } from "../src/domain/characterKnowledge/knowledgeEvolution";
import { acceptOrganizedKnowledge, organizationSourceRevision } from "../src/domain/characterKnowledge/knowledgeOrganization";
import { saveKnowledgeClaims, loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { CHARACTER_CONTINUITY_KEY, loadCharacterContinuity } from "../src/core/storage/repositories/characterContinuityRepository";
import { forgetKnowledgeClaim } from "../src/features/characterKnowledge/services/characterContinuityService";
import { isForgottenKnowledge } from "../src/domain/memory/characterContinuity";
import { createManualKnowledgeClaim } from "../src/features/characterKnowledge/services/manualKnowledgeService";
const values = new Map<string, string>(); let fail = false;
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (fail && key === CHARACTER_CONTINUITY_KEY) { fail = false; throw Error("quota"); } values.set(key, value); }, removeItem: (key: string) => values.delete(key) } } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const fact = (id: string, statement: string, recordedAt = 100): KnowledgeClaim => ({ ...scope, id, statement, kind: "fact", subject: "user", temporalStatus: "present", truthStatus: "asserted", confidence: .85, userConfirmed: false,
  status: "active", schemaVersion: 1, visibility: "relation_private", recordedAt, source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: id, messageIds: [id], statementAt: recordedAt } });
const old = fact("old", "我喜欢咖啡"); const current = fact("current", "我现在不喜欢咖啡", 200);
saveKnowledgeClaims(evolveKnowledgeClaims([old], [current]));
assert.ok(forgetKnowledgeClaim(loadKnowledgeClaims().value[0]).success);
assert.equal(loadKnowledgeClaims().value.find((claim) => claim.id === current.id)?.status, "active", "deleting an old value must not delete its different current value");
const forgotten = loadCharacterContinuity().value.forgotten;
assert.equal(isForgottenKnowledge({ ...old, id: "re-extracted" }, forgotten), true);
assert.equal(isForgottenKnowledge(fact("future-source", "我喜欢咖啡", Date.now() + 1000), forgotten), false, "a fresh later statement can establish a new state");
values.clear();
const parent = { ...fact("parent", "用户喜欢咖啡。用户喜欢茶。"), temporalStatus: "unknown" as const, truthStatus: "legacy_unverified" as const,
  source: { kind: "legacy_memory" as const, authorship: "unknown" as const, producer: "fixture", evidenceKey: "parent", sourceRecordId: "original" } };
const atoms = acceptOrganizedKnowledge(parent, ["用户喜欢咖啡", "用户喜欢茶"].map((quote) => ({ sourceId: parent.id, quote, kind: "preference", temporalStatus: "present" })));
saveKnowledgeClaims([{ ...parent, organizationOriginal: true }, ...atoms]);
assert.ok(forgetKnowledgeClaim(loadKnowledgeClaims().value.find((claim) => claim.statement === "用户喜欢咖啡")!).success);
const after = loadKnowledgeClaims().value; const remainingParent = after.find((claim) => claim.id === parent.id)!;
assert.doesNotMatch(remainingParent.statement, /咖啡/);
const tea = after.find((claim) => claim.organizationSourceId === parent.id && claim.statement === "用户喜欢茶")!;
assert.equal(tea.status, "active"); assert.equal(tea.organizationSourceRevision, organizationSourceRevision(remainingParent));
values.clear(); saveKnowledgeClaims([old]); const before = JSON.stringify(loadKnowledgeClaims().value); fail = true;
assert.equal(forgetKnowledgeClaim(loadKnowledgeClaims().value[0]).success, false);
assert.equal(JSON.stringify(loadKnowledgeClaims().value), before); assert.equal(loadCharacterContinuity().value.forgotten.length, 0);
const editedPlan = createManualKnowledgeClaim({ id: "edited-plan", scope, sourceRecordId: "original-plan", statement: "约好2026-10-20去天文馆", recordedAt: 300,
  classification: { kind: "plan", subject: "relationship", temporalStatus: "future" } });
assert.equal(editedPlan?.kind, "plan"); assert.equal(editedPlan?.subject, "relationship"); assert.equal(editedPlan?.temporalStatus, "future");
console.log("PASS version deletion: current value preserved, old-source resurrection blocked, future fresh learning allowed, source-card clause removed without losing other atoms, atomic rollback");
