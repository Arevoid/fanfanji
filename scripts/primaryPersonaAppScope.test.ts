import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const offline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const widgets = readFileSync(new URL("../src/components/HomeScreenWidgets.tsx", import.meta.url), "utf8");
const notes = readFileSync(new URL("../src/components/AppNotes.tsx", import.meta.url), "utf8");

assert.match(app, /const primaryIdentityId = characterPhoneOwnerIdentityId/, "主身份范围复用主人设归属");
assert.match(app, /<AppOffline[\s\S]*?ownerIdentityId=\{primaryIdentityId\}/, "线下页面固定使用主人设");
assert.match(app, /<AppReading[\s\S]*?userIdentityId=\{primaryIdentityId\}/, "阅读页面固定使用主人设");
assert.match(app, /<AppDiary[\s\S]*?activeIdentity=\{primaryIdentity\}/, "日记页面固定使用主人设");
assert.match(app, /chatStatsIdentity:\s*primaryIdentity/, "桌面聊天统计固定使用主人设");
assert.match(offline, /ownerIdentityId\?: string/, "线下页面声明主人设归属参数");
assert.match(offline, /const activeIdentityId = ownerIdentityId \|\| settings\.activeIdentityId/, "线下页面优先主人设归属");
assert.doesNotMatch(notes, /activeIdentityId|activeIdentity/, "备忘录不按当前马甲拆分数据");
assert.match(widgets, /chatStatsIdentity\?: UserIdentity/, "聊天统计支持独立身份范围");
assert.match(widgets, /getChatStatsData\(messages, relationships, characters, chatStatsIdentity \|\| activeIdentity\)/, "聊天统计优先主人设身份");

console.log("PASS primary persona scoped apps ignore active aliases");
