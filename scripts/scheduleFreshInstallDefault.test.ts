import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldSeedScheduleForFreshInstall } from "../src/features/home/freshInstallPolicy";

const storage = (values: Record<string, string> = {}) => ({
  getItem: (key: string) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null,
});

assert.equal(shouldSeedScheduleForFreshInstall(storage()), true, "an untouched install receives Schedule by default");
assert.equal(shouldSeedScheduleForFreshInstall(storage({ phone_homescreen_items: "[]" })), false, "an existing customized desktop is never changed");
assert.equal(shouldSeedScheduleForFreshInstall(storage({ phone_installed_apps: "[]" })), false, "an existing install list is authoritative even when empty");
assert.equal(shouldSeedScheduleForFreshInstall(storage({ phone_messages_v3: "[{\"id\":\"m1\"}]" })), false, "existing chat data protects a legacy user");
assert.equal(shouldSeedScheduleForFreshInstall(storage({ phone_settings: "{\"name\":\"饭饭\"}" })), false, "existing settings protect a legacy user");
assert.equal(shouldSeedScheduleForFreshInstall(storage({ phone_messages_v3: "[]" })), true, "empty repository scaffolding is not user data");

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(app, /id: "schedule", type: "app"[\s\S]*row: 4, column: 1/);
assert.match(app, /item\.id !== "schedule" \|\| seedScheduleForFreshInstall/);
assert.match(app, /if \(!raw && seedScheduleForFreshInstall\) parsed\.push\("schedule"\)/);
assert.doesNotMatch(chat, /允许对方在距离、时间和聊天上下文合理时提出见面/);

console.log("PASS Schedule is default only for untouched installs and proactive-offline helper copy is removed");
