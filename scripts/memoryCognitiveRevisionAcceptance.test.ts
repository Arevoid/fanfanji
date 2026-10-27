import assert from "node:assert/strict";
import { acceptImpression, reviseImpression, reconcileImpressions, emptyCharacterContinuity } from "../src/domain/memory/characterContinuity";
import { isCharacterContinuityStore } from "../src/core/storage/repositories/characterContinuityRepository";
import { projectImpressionGrowth } from "../src/domain/memory/impressionGrowth";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { resolveOmittedImpressionThemes } from "../src/features/characterKnowledge/services/impressionThemeResolution";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const facts: KnowledgeClaim[] = ["old1", "old2", "old3", "new1", "new2", "new3"].map((id, index) => ({ ...scope, id, statement: `用户的具体相处经历${index}`, kind: "fact", subject: "user",
  temporalStatus: "past", truthStatus: "asserted", confidence: .85, userConfirmed: false, recordedAt: index, status: "active", schemaVersion: 1, visibility: "relation_private",
  source: { kind: "user_message", authorship: "user", messageIds: [id], evidenceGroups: [[id]], producer: "fixture", evidenceKey: id } }));
const old = acceptImpression({ category: "情绪表达方式", proposition: "我长期觉得对方不善于表达关怀", sourceClaimIds: ["old1", "old2", "old3"], confidence: .75, growth: { comfort: -.02 } }, scope, facts, 100, "old", [])!;
const omitted = { category: "关怀", proposition: "我觉得用户其实很温柔", sourceClaimIds: ["new1"], confidence: .75, growth: { trust: .03 } };
const unbound = acceptImpression(omitted, scope, facts, 200, "omitted", [old])!;
assert.equal(unbound.status, "candidate", "omitting the theme reference cannot silently create an active contrary opinion");
assert.deepEqual(projectImpressionGrowth(undefined, reviseImpression([old], unbound, facts)), projectImpressionGrowth(undefined, [old]));
const themes = await resolveOmittedImpressionThemes({ candidates: [omitted], existing: [old], configuration: { apiKey: "synthetic", model: "synthetic" },
  request: async () => ({ text: JSON.stringify({ decisions: [{ index: 0, referenceId: old.id, confidence: .98, reason: "同一相处印象的新理解", revisionMode: "oppose" }] }) }) });
const rebound = acceptImpression(themes.get(0)!.candidate, scope, facts, 200, "rebound", [old])!;
assert.equal(rebound.themeKey, old.themeKey);
assert.equal(reviseImpression([old], rebound, facts).at(-1)?.status, "candidate", "semantic rebinding still obeys the independent-evidence threshold");
assert.equal((await resolveOmittedImpressionThemes({ candidates: [omitted], existing: [old], configuration: { apiKey: "synthetic", model: "synthetic" },
  request: async () => { throw Error("offline"); } })).size, 0);
const independent = await resolveOmittedImpressionThemes({ candidates: [omitted], existing: [old], configuration: { apiKey: "synthetic", model: "synthetic" },
  request: async () => ({ text: JSON.stringify({ decisions: [{ index: 0, newTheme: true, confidence: .98, reason: "独立认识问题" }] }) }) });
assert.equal(acceptImpression(independent.get(0)!.candidate, scope, facts, 200, "independent", [old], independent.get(0)!.newTheme)?.status, "active");
const proposal = (id: string, sourceClaimIds: string[], confidence = .7) => acceptImpression({ category: "关心他人的方式", proposition: "表达很含蓄，但逐渐发现对方会用行动关心别人", sourceClaimIds,
  opposingClaimIds: sourceClaimIds, confidence, themeReferenceId: old.id, revisionMode: "oppose", revisionReason: "新的具体行动与原来的理解不同，需要结合多次经历观察", growth: { comfort: .03 } }, scope, facts, 200, id, [old])!;
const weak = proposal("weak", ["new1"], .1);
const held = reviseImpression([old], weak, facts);
assert.equal(held[0].status, "active"); assert.equal(held[1].status, "candidate");
assert.equal(projectImpressionGrowth(undefined, held).comfort, projectImpressionGrowth(undefined, [old]).comfort, "pending views cannot silently change behaviour");
assert.ok(isCharacterContinuityStore({ ...emptyCharacterContinuity(), impressions: JSON.parse(JSON.stringify(held)) }));
const stronger = proposal("strong", ["new1", "new2", "new3"]);
assert.equal(stronger.themeKey, old.themeKey, "semantic reference joins different category words without aliases");
const revised = reviseImpression(held, stronger, facts);
assert.equal(revised[0].status, "superseded"); assert.equal(revised.at(-1)?.status, "active");
assert.ok(revised.at(-1)?.sourceClaimIds.includes("new1"));
assert.equal(reconcileImpressions(revised, facts.filter((claim) => claim.id !== "new2"), 300).at(-1)?.status, "invalid");
const copiedSources = facts.map((claim) => claim.id.startsWith("new") ? { ...claim, source: { ...claim.source, messageIds: ["same"], evidenceGroups: [["same"]] } } : claim);
assert.equal(reviseImpression([old], stronger, copiedSources).at(-1)?.status, "candidate", "repeated extraction of one source is not several independent experiences");
assert.equal(acceptImpression({ category: "新措辞", proposition: "更了解对方", sourceClaimIds: ["new1"], themeReferenceId: old.id, revisionReason: "比较" },
  { ...scope, relationId: "foreign" }, facts.map((fact) => ({ ...fact, relationId: "foreign" })), 200, "foreign", [old]), undefined);
console.log("PASS cognition: semantic theme references, weak single-evidence hold, independent-source weighting, gradual revision, reversible behaviour, refresh/source withdrawal and foreign-theme rejection");
