import assert from "node:assert/strict";
import {
  getDirectChatMemoryLongEvidenceCollectorInstanceOrdinal,
  refreshDirectChatMemoryLongEvidenceDevApiForTests,
} from "../src/features/chat/services/directChatMemoryLongEvidenceCollector";

type Root = typeof globalThis & {
  __fanfanjiMemoryAdmissionLongEvidence?: { instanceOrdinal?: number };
};

const root = globalThis as Root;
const staleApi = { instanceOrdinal: -1 };
root.__fanfanjiMemoryAdmissionLongEvidence = staleApi;
refreshDirectChatMemoryLongEvidenceDevApiForTests();

assert.notEqual(root.__fanfanjiMemoryAdmissionLongEvidence, staleApi, "HMR must replace stale helper closures");
assert.equal(
  root.__fanfanjiMemoryAdmissionLongEvidence?.instanceOrdinal,
  getDirectChatMemoryLongEvidenceCollectorInstanceOrdinal(),
  "dev helper must identify the current Collector instance",
);

console.log("PASS long-evidence HMR contract: dev helper rebinds to the current Collector instance");
