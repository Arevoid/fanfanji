import assert from "node:assert/strict";
import { createCharacterMemoryRepository } from "../src/domain/memory/CharacterMemoryRepository";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const scope = {
  characterId: "character-pending-summary",
  relationId: "relation-pending-summary",
  userIdentityId: "identity-pending-summary",
  conversationId: "direct:relation-pending-summary",
};
const claim: KnowledgeClaim = {
  ...scope,
  id: "claim-pending-summary",
  kind: "fact",
  subject: "user",
  statement: "canonical Truth remains readable while Summary is pending",
  truthStatus: "confirmed",
  temporalStatus: "present",
  source: { kind: "user_message", authorship: "user", messageIds: ["message-pending-summary"], producer: "test", evidenceKey: "pending-summary" },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};

const read = createCharacterMemoryRepository({ claims: [claim], summaries: [], memories: [], events: [] }).readForScope(scope, 100);
assert.equal(read.records.some((record) => record.id === claim.id && record.kind === "truth"), true);
assert.equal(read.records.some((record) => record.kind === "summary"), false);
assert.equal(read.dropped.length, 0, "a missing pending Summary does not block or fail Truth retrieval");

console.log("direct chat pending Summary read characterization passed");
