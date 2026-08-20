import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectSystemBackup, type SystemBackupEnvelope } from "../src/features/settings/systemBackup";

const valid: SystemBackupEnvelope = {
  format: "fanfanji-system-backup",
  version: 3,
  exportedAt: Date.now(),
  localStorage: { "phone_settings": "{}" },
  indexedDb: { "messages-v4": [{ id: "m1" }], "character-archive-v4": { version: 1 } },
};
const report = inspectSystemBackup(valid);
assert.equal(report.valid, true);
assert.equal(report.legacy, false);
assert.equal(report.localStorageKeyCount, 1);
assert.deepEqual(report.modules.map((module) => [module.key, module.kind, module.recordCount]), [
  ["messages-v4", "array", 1],
  ["character-archive-v4", "object", undefined],
]);

const invalid = inspectSystemBackup({ format: "fanfanji-system-backup", version: 999, localStorage: {}, indexedDb: {} });
assert.equal(invalid.valid, false);
assert.match(invalid.error || "", /不支持/);
const backupActionsSource = readFileSync(new URL("../src/features/settings/hooks/useSystemBackupActions.ts", import.meta.url), "utf8");
assert.match(backupActionsSource, /只读恢复模式不会修改当前数据/);
assert.match(backupActionsSource, /downloadOriginalBackupFile\(file\)/);
console.log("PASS system backup read-only inspection does not mutate restore state");
