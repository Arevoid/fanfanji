import assert from "node:assert/strict";
import { evaluateKnowledgeWrite, normalizeKnowledgeClaim } from "../src/domain/characterKnowledge/knowledgeWritePolicy";
import { describeKnowledgeEvidence, knowledgeEvidenceLabel } from "../src/domain/characterKnowledge/knowledgeEvidence";
import type { KnowledgeWriteCandidate } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
const candidate: KnowledgeWriteCandidate = { id: "e", characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c",
  kind: "fact", subject: "user", statement: "用户的朋友喜欢咖啡", temporalStatus: "present", recordedAt: 100,
  source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: "e", messageIds: ["m"],
    evidenceQuote: "我听说朋友喜欢咖啡", statementAt: 50 }, requestedTruthStatus: "confirmed" };
const accepted = evaluateKnowledgeWrite(candidate);
assert.ok(accepted.accepted);
assert.equal(accepted.claim.truthStatus, "inferred");
assert.equal(accepted.claim.userConfirmed, false);
assert.equal(normalizeKnowledgeClaim(accepted.claim)?.source.evidenceQuote, candidate.source.evidenceQuote);
assert.match(knowledgeEvidenceLabel(accepted.claim), /转述，未证明/);
const unknown = describeKnowledgeEvidence({ ...candidate.source, evidenceQuote: undefined, statementAt: undefined }, "昨天去了公园", "a");
assert.equal(unknown.eventDate, undefined); assert.deepEqual(unknown.knownBy, ["a"]);
assert.equal(describeKnowledgeEvidence(candidate.source, "明天去公园", "a").eventDate, undefined,
  "UTC timestamps do not establish the speaker's calendar-day timezone");
assert.equal(describeKnowledgeEvidence(candidate.source, "2026年10月14日约好看电影", "a").eventDate, "2026-10-14");
assert.equal(describeKnowledgeEvidence(candidate.source, "2026年13月32日", "a").eventDate, undefined);
assert.equal(describeKnowledgeEvidence(candidate.source, "2026年10月搬过家", "a").datePrecision, "month");
assert.equal(describeKnowledgeEvidence(candidate.source, "2025年搬过家", "a").datePrecision, "year");
console.log("PASS evidence acceptance: stored source quotes, hearsay authority, exact awareness owner and conservative calendar precision");
