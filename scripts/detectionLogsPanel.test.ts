import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/features/settings/components/DetectionLogsPanel.tsx", import.meta.url), "utf8");
const ledger = readFileSync(new URL("../src/core/monitoring/aiRequestLedger.ts", import.meta.url), "utf8");
const apiHelper = readFileSync(new URL("../src/utils/apiHelper.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../src/features/settings/settingsNavigation.ts", import.meta.url), "utf8");

assert.match(settings, /activeTab === "data"/);
assert.match(settings, /<SystemBackupPanel/);
assert.match(settings, /<StorageDiagnosticsCard/);
assert.match(settings, /<StorageCachePanel mode="user" \/>/);
assert.match(settings, /activeTab === "system"[\s\S]*?<DetectionLogsPanel \/>/);
assert.match(navigation, /system:\s*"检测日志"/);
assert.match(panel, /API 调用详情/);
assert.match(panel, /线下 · 剧情续写/);
assert.match(panel, /MAX_VISIBLE_RECORDS = 50/);
assert.match(panel, /调用内容/);
assert.doesNotMatch(panel, /systemPromptPreview/);
assert.match(panel, /传输方式/);
assert.doesNotMatch(apiHelper, /systemPromptPreview/);
assert.match(panel, />输入</);
assert.match(panel, />输出</);
assert.match(panel, /clearAiRequestLedger/);
assert.match(panel, /只会删除本地调用记录/);
assert.doesNotMatch(panel, /刷新检测日志/);
assert.doesNotMatch(panel, /Token 统计详情/);
assert.doesNotMatch(panel, /运行时错误与系统事件/);
assert.doesNotMatch(panel, /只看失败/);
assert.doesNotMatch(panel, /复制脱敏记录/);
assert.doesNotMatch(panel, /只记录本机脱敏的调用元数据/);
assert.doesNotMatch(panel, /settings-section-header/);
assert.doesNotMatch(ledger, /systemPromptPreview/);
assert.match(ledger, /线上对话提示词/);
assert.match(ledger, /线下剧情提示词/);

console.log("PASS detection logs and grouped data management settings contracts");
