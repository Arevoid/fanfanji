import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type SetBehavior = "normal" | "quota" | "corrupt" | "write-then-throw";
type RemoveBehavior = "normal" | "noop" | "remove-then-throw";

class ControlledStorage implements Storage {
  private readonly values = new Map<string, string>();
  nextSetBehavior: SetBehavior = "normal";
  nextRemoveBehavior: RemoveBehavior = "normal";

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }

  setItem(key: string, value: string): void {
    const behavior = this.nextSetBehavior;
    this.nextSetBehavior = "normal";
    if (behavior === "quota") throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    if (behavior === "corrupt") {
      this.values.set(key, `${value}-corrupted`);
      return;
    }
    this.values.set(key, value);
    if (behavior === "write-then-throw") throw new Error("simulated interrupted write");
  }

  removeItem(key: string): void {
    const behavior = this.nextRemoveBehavior;
    this.nextRemoveBehavior = "normal";
    if (behavior === "noop") return;
    this.values.delete(key);
    if (behavior === "remove-then-throw") throw new Error("simulated interrupted removal");
  }
}

const storage = new ControlledStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

const { readJson, remove, writeJson, writeString } = await import("../src/core/storage/storageAdapter");
const { writeArray } = await import("../src/core/storage/repositories/repositoryUtils");

assert.deepEqual(writeString("plain", "next"), { success: true });
assert.equal(storage.getItem("plain"), "next");

storage.setItem("plain", "previous");
storage.nextSetBehavior = "quota";
assert.deepEqual(writeString("plain", "next"), { success: false, error: "quota" });
assert.equal(storage.getItem("plain"), "previous", "quota failure must preserve the previous value");

storage.nextSetBehavior = "corrupt";
assert.deepEqual(writeString("plain", "next"), { success: false, error: "verification" });
assert.equal(storage.getItem("plain"), "previous", "failed verification must roll back the write");

storage.nextSetBehavior = "write-then-throw";
assert.deepEqual(writeString("plain", "next"), { success: false, error: "write" });
assert.equal(storage.getItem("plain"), "previous", "an interrupted write must roll back the write");

const circular: { self?: unknown } = {};
circular.self = circular;
assert.deepEqual(writeJson("plain", circular), { success: false, error: "serialize" });
assert.equal(storage.getItem("plain"), "previous", "serialization failure must not touch storage");
assert.deepEqual(writeJson("plain", undefined), { success: false, error: "serialize" });
assert.equal(storage.getItem("plain"), "previous");

storage.setItem("broken-json", "{");
assert.deepEqual(readJson("broken-json", { safe: true }), {
  value: { safe: true },
  found: true,
  valid: false,
  error: "parse",
});
assert.equal(storage.getItem("broken-json"), "{", "corrupt source data must remain available for recovery");

storage.setItem("array", "[1,2]");
assert.deepEqual(writeArray("array", { invalid: true } as unknown as number[]), {
  success: false,
  error: "validation",
});
assert.equal(storage.getItem("array"), "[1,2]", "invalid repository input must not overwrite valid data");

storage.setItem("remove-me", "recoverable");
storage.nextRemoveBehavior = "remove-then-throw";
assert.deepEqual(remove("remove-me"), { success: false, error: "remove" });
assert.equal(storage.getItem("remove-me"), "recoverable", "an interrupted removal must be rolled back");

storage.nextRemoveBehavior = "noop";
assert.deepEqual(remove("remove-me"), { success: false, error: "verification" });
assert.equal(storage.getItem("remove-me"), "recoverable");

assert.deepEqual(remove("remove-me"), { success: true });
assert.equal(storage.getItem("remove-me"), null);

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const collectSourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const absolutePath = path.join(directory, entry.name);
  if (entry.isDirectory()) return collectSourceFiles(absolutePath);
  return entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
});
const rawStorageMutationFiles = collectSourceFiles(sourceRoot)
  .filter((file) => /localStorage\.(?:setItem|removeItem)/.test(readFileSync(file, "utf8")))
  .map((file) => path.relative(sourceRoot, file).replaceAll("\\", "/"));
assert.deepEqual(rawStorageMutationFiles, [],
  "all application storage mutations must go through the storage adapter");
assert.doesNotMatch(readFileSync(path.join(sourceRoot, "main.tsx"), "utf8"), /localStorage\.setItem\s*=/,
  "the app entry must not globally swallow storage write failures");

console.log("PASS storage validation, quota protection, verification, corruption fallback, and rollback");
