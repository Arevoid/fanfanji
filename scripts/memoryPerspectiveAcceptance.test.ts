import assert from "node:assert/strict";
import { evaluateKnowledgeWrite, normalizeKnowledgeClaim } from "../src/domain/characterKnowledge/knowledgeWritePolicy";
import { buildKnowledgePerspective, perspectiveMatchesScope } from "../src/domain/characterKnowledge/knowledgePerspective";
import { MemoryService } from "../src/domain/memory/MemoryService";
import type { Character } from "../src/types";
import { matchesMemoryQueryConstraints } from "../src/domain/memory/memoryQueryConstraints";
import { knowledgeEvidenceLabel } from "../src/domain/characterKnowledge/knowledgeEvidence";
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const decision = evaluateKnowledgeWrite({ ...scope, id: "reported", statement: "我听说B在2026-10-14生病了", subject: "other", kind: "fact", temporalStatus: "past",
  source: { kind: "user_message", authorship: "user", messageIds: ["m"], messageRevisions: { m: "v1" }, statementAt: 100,
    evidenceQuote: "我听说B在2026-10-14生病了", producer: "fixture", evidenceKey: "m" }, recordedAt: 200 });
assert.ok(decision.accepted);
if (!decision.accepted) throw Error("write rejected");
assert.equal(decision.claim.perspective?.speaker.id, "u");
assert.equal(decision.claim.perspective?.acquisition.holderCharacterId, "a");
assert.equal(decision.claim.perspective?.acquisition.mode, "reported");
assert.deepEqual(decision.claim.perspective?.actionActors, []);
assert.deepEqual(decision.claim.perspective?.participants, []);
assert.equal(decision.claim.perspective?.eventTime.calendar, "2026-10-14");
assert.equal(decision.claim.perspective?.statementAt, 100);
assert.equal(perspectiveMatchesScope(decision.claim, { ...scope, characterId: "c" }), false);
const restored = normalizeKnowledgeClaim(JSON.parse(JSON.stringify({ ...decision.claim,
  perspective: { acquisition: { holderCharacterId: "foreign", mode: "confirmed_participation" }, actionActors: [{ kind: "character", id: "foreign" }] } })))!;
assert.equal(restored.perspective?.acquisition.holderCharacterId, "a");
assert.deepEqual(restored.perspective?.actionActors, [], "model/import provenance cannot grant participation or another character's knowledge");
assert.equal(buildKnowledgePerspective({ ...restored, status: "retracted" }).sourceState, "retracted");
assert.equal(normalizeKnowledgeClaim({ ...restored, perspective: undefined })?.perspective?.acquisition.mode, "reported", "old records upgrade without inventing a witness");
assert.equal(buildKnowledgePerspective({ ...restored, source: { ...restored.source, kind: "legacy_memory", authorship: "unknown", sourceRecordId: "legacy" } }).acquisition.mode, "unknown");
const text = "小林转述小周在2026-10-01至2026-10-03照顾生病的家人，我没有在场";
const extracted = await MemoryService.extractMemories({ ...scope, character: { id: "a", name: "角色" } as Character, recentMessages: [{ ...scope,
  id: "roles", sender: "user", content: text, timestamp: 100 }], existingClaims: [], existingMemories: [], scenario: "chat", apiKey: "synthetic", model: "synthetic",
  createId: () => "roles", currentTime: () => 200, formatContent: (items) => items.join("\n") }, async () => ({ candidates: [{ statement: text, evidenceQuote: text,
  sourceMessageIds: ["roles"], kind: "fact", subject: "other", temporalStatus: "past", sourceInterpretation: {
    acquisition: "hearsay", acquisitionQuote: text, roles: [{ mention: "小林", role: "informant", quote: text }, { mention: "小周", role: "actor", quote: text },
      { mention: "不存在", role: "observer", quote: "伪造目击" }], interval: { from: "2026-10-01", to: "2026-10-03", quote: text } } }] }));
const roleRecord = normalizeKnowledgeClaim(JSON.parse(JSON.stringify(extracted.acceptedClaims[0])))!;
assert.equal(roleRecord.truthStatus, "inferred"); assert.equal(roleRecord.perspective?.speaker.id, "u");
assert.deepEqual(roleRecord.perspective?.participants, []); assert.deepEqual(roleRecord.perspective?.actionActors, []);
assert.deepEqual(roleRecord.perspective?.reportedRoles?.map((role) => [role.mention, role.role]), [["小林", "informant"], ["小周", "actor"]]);
assert.ok(roleRecord.perspective?.reportedRoles?.every((role) => role.mentionId.startsWith('["source-mention"')));
assert.equal(roleRecord.perspective?.eventTime.precision, "range"); assert.equal(roleRecord.perspective?.eventTime.to, "2026-10-03");
assert.equal(matchesMemoryQueryConstraints(roleRecord, { eventDate: "2026-10-02" }), true);
assert.equal(matchesMemoryQueryConstraints(roleRecord, { eventDate: "2026-10-04" }), false);
assert.match(knowledgeEvidenceLabel(roleRecord), /转述者=小林、行动者=小周/); assert.match(knowledgeEvidenceLabel(roleRecord), /不授予角色知情/);
const mixed = await MemoryService.extractMemories({ ...scope, character: { id: "a", name: "角色" } as Character,
  recentMessages: [{ ...scope, id: "quoted-character", sender: "character", content: "我有些担心", timestamp: 200 },
    { ...scope, id: "later-question", sender: "user", content: "那你现在怎么想", timestamp: 500 }], existingClaims: [], existingMemories: [], scenario: "chat",
  apiKey: "synthetic", model: "synthetic", createId: () => "mixed", currentTime: () => 600, formatContent: (items) => items.join("\n") }, async () => ({ candidates: [{
    statement: "角色有些担心", evidenceQuote: "我有些担心", sourceMessageIds: ["quoted-character", "later-question"], kind: "belief", subject: "character", temporalStatus: "present" }] }));
assert.equal(mixed.acceptedClaims[0].perspective?.speaker.id, "a", "a mixed evidence group retains the actual quoted speaker");
assert.equal(mixed.acceptedClaims[0].source.statementAt, 200, "a later supporting message cannot move the quote's statement time");
assert.equal(mixed.acceptedClaims[0].truthStatus, "inferred", "speaker attribution does not upgrade character-generated text to fact authority");
console.log("PASS provenance acceptance: persisted speaker/acquisition/time, unknown actors, exact scope, forged grants rejected, source withdrawal and conservative old-record upgrade");
