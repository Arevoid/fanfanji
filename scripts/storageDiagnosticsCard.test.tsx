import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const card = readFileSync(new URL("../src/features/settings/components/StorageDiagnosticsCard.tsx", import.meta.url), "utf8");
assert.match(card, /最近迁移/);
assert.match(card, /migrationState\?\.phase === "completed"/);
assert.match(card, /migrationState\.updatedAt/);
assert.match(card, /当前 schema 基线/);
assert.match(card, /迁移脚本版本/);
assert.match(card, /未完成迁移/);
assert.match(card, /migrationState && diagnostics\.migrationState\.phase !== "completed"/);
assert.match(card, /API 调用统计（近 90 天）/);
assert.match(card, /运行时错误统计（近 30 天）/);

console.log("PASS storage diagnostics exposes last completed migration and unfinished migration status");
