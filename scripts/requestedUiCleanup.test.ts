import assert from "node:assert/strict";
import fs from "node:fs";

const offline = fs.readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const settings = fs.readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const settingsNavigation = fs.readFileSync(
  new URL("../src/features/settings/settingsNavigation.ts", import.meta.url),
  "utf8",
);
const archives = fs.readFileSync(new URL("../src/components/AppArchives.tsx", import.meta.url), "utf8");
const chat = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.doesNotMatch(offline, /当前模式不会自动同步记忆；请在剧本设置中手动确认同步/);
assert.doesNotMatch(settings, /高级诊断\s*·\s*提示词检查器|PromptDebugPanel|prompt_debug/);
assert.doesNotMatch(archives, /bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1\.5/);
assert.match(archives, /绑定专属音色 ID \(选填\)[\s\S]*label: "Mossland"[\s\S]*label: "MiniMax"/);
assert.match(archives, /min-w-0 px-5 py-3 rounded-\[8px\] bg-slate-50/);
assert.match(settings, /语音平台[\s\S]*value="mossland">Mossland[\s\S]*value="minimax">MiniMax/);
assert.match(settings, /Mossland 接口配置[\s\S]*mosslandApiEndpoint[\s\S]*mosslandApiKey[\s\S]*mosslandModel/);
assert.match(settings, />\s*保存设置\s*</);
assert.match(settingsNavigation, /minimax:\s*"语音图片"/);
assert.match(
  settings,
  /<section className="settings-card overflow-hidden[\s\S]*?语音合成总开关[\s\S]*?border-b border-\[var\(--divider\)\][\s\S]*?语音平台[\s\S]*?Mossland 接口配置[\s\S]*?<\/section>/,
);
assert.match(chat, /Mossland VOICE ID[\s\S]*MiniMax VOICE ID/);

console.log("requested UI cleanup tests passed");
