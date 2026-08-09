import assert from "node:assert/strict";
import fs from "node:fs";

const offline = fs.readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const settings = fs.readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const archives = fs.readFileSync(new URL("../src/components/AppArchives.tsx", import.meta.url), "utf8");

assert.doesNotMatch(offline, /当前模式不会自动同步记忆；请在剧本设置中手动确认同步/);
assert.doesNotMatch(settings, /高级诊断\s*·\s*提示词检查器|PromptDebugPanel|prompt_debug/);
assert.doesNotMatch(archives, /bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1\.5/);
assert.match(archives, /绑定 MiniMax 专属音色 ID \(选填\)[\s\S]*min-w-0 px-5 py-3 rounded-\[8px\] bg-slate-50/);

console.log("requested UI cleanup tests passed");
