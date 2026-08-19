import assert from "node:assert/strict";
import { inspectStorage } from "../src/core/storage/storageDiagnostics";

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
const diagnostics = await inspectStorage();
assert.equal(diagnostics.health.checkedCollections, 2);
assert.equal(diagnostics.health.findings.some((finding) => finding.kind === "duplicate-id"), true);
assert.equal(diagnostics.health.findings.some((finding) => finding.kind === "invalid-json"), true);
console.log("PASS storage health scan reports corruption and duplicate IDs without modifying data");
