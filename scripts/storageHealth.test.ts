import assert from "node:assert/strict";
import { buildStorageDiagnosticReport, inspectStorage } from "../src/core/storage/storageDiagnostics";

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  key: (index: number) => [...values.keys()][index] ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
} as Storage;
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });

storage.setItem("phone_characters_v3", JSON.stringify([{ id: "same" }, { id: "same" }]));
storage.setItem("phone_moments_v3", "{");
storage.setItem("phone_character_relationships", JSON.stringify([{ id: "relationship-1" }]));
storage.setItem("phone_messages_v3", JSON.stringify([{ id: "message-1", relationId: "missing-relationship" }]));
const diagnostics = await inspectStorage();
assert.equal(diagnostics.health.checkedCollections, 4);
assert.equal(diagnostics.health.findings.some((finding) => finding.kind === "duplicate-id"), true);
assert.equal(diagnostics.health.findings.some((finding) => finding.kind === "invalid-json"), true);
assert.equal(diagnostics.health.findings.some((finding) => finding.kind === "orphan-reference"), true);
assert.equal(storage.getItem("phone_messages_v3"), JSON.stringify([{ id: "message-1", relationId: "missing-relationship" }]));
const report = buildStorageDiagnosticReport(diagnostics, "test-version", 3, 123);
assert.equal(report.format, "fanfanji-storage-diagnostic");
assert.equal(report.capturedAt, 123);
assert.equal(JSON.stringify(report).includes("missing-relationship"), false, "diagnostic reports must not include record values");
assert.equal(JSON.stringify(report).includes("same"), false, "diagnostic reports must not include record IDs");
console.log("PASS storage health scan reports corruption, duplicate IDs, and orphan references without modifying data");
