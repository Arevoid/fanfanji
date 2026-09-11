import assert from "node:assert/strict";
import {
  clearDirectChatMemoryEvidenceTrace,
  exportDirectChatMemoryEvidenceTraceJson,
  getDirectChatMemoryEvidenceTrace,
  recordDirectChatMemoryEvidenceTrace,
} from "../src/features/chat/services/directChatMemoryEvidenceTrace";

clearDirectChatMemoryEvidenceTrace();
recordDirectChatMemoryEvidenceTrace({
  stage: "observer_skipped",
  timestamp: Date.now(),
  reason: "before_snapshot_missing",
  longEvidenceEnabled: true,
  collectorActive: true,
  hasWindow: true,
  hasLongEvidenceBefore: false,
  collectorInstanceOrdinal: 2,
});
recordDirectChatMemoryEvidenceTrace({
  stage: "extraction_completed",
  timestamp: Date.now(),
  shadowCandidateCount: 5000,
  devApiInstanceOrdinal: 3,
});
recordDirectChatMemoryEvidenceTrace({
  stage: "observer_skipped",
  timestamp: Date.now(),
  reason: "raw exception with private statement" as never,
  hasCanonicalAfter: false,
});

for (let index = 0; index < 70; index += 1) {
  recordDirectChatMemoryEvidenceTrace({ stage: "observer_entered", timestamp: index });
}

const entries = getDirectChatMemoryEvidenceTrace();
assert.equal(entries.length, 64, "runtime trace must remain bounded");
assert.ok(entries.every((entry) => entry.stage === "observer_entered"));
const exported = exportDirectChatMemoryEvidenceTraceJson();
assert.doesNotMatch(exported, /private statement|raw exception|authorization|api[_ -]?key|prompt|response|token/i);
assert.doesNotMatch(exported, /5000/);
assert.equal(JSON.parse(exported).entryCount, 64);

console.log("PASS direct-chat evidence trace: bounded, metadata-only, and privacy-safe");
