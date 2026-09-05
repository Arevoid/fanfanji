import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldSeedFreshDesktopDefaults } from "../src/features/home/freshInstallPolicy";

const storage = (values: Record<string, string> = {}) => ({
  getItem: (key: string) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null,
});

assert.equal(shouldSeedFreshDesktopDefaults(storage()), true, "an untouched install receives the new default apps");
assert.equal(shouldSeedFreshDesktopDefaults(storage({ phone_homescreen_items: "[]" })), false, "an existing customized desktop is never changed");
assert.equal(shouldSeedFreshDesktopDefaults(storage({ phone_installed_apps: "[]" })), false, "an existing install list is authoritative even when empty");
assert.equal(shouldSeedFreshDesktopDefaults(storage({ phone_messages_v3: "[{\"id\":\"m1\"}]" })), false, "existing chat data protects a legacy user");
assert.equal(shouldSeedFreshDesktopDefaults(storage({ phone_settings: "{\"name\":\"饭饭\"}" })), false, "existing settings protect a legacy user");
assert.equal(shouldSeedFreshDesktopDefaults(storage({ phone_messages_v3: "[]" })), true, "empty repository scaffolding is not user data");

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(app, /id: "schedule", type: "app"[\s\S]*row: 5, column: 1/);
assert.match(app, /id: HOME_WELCOME_WIDGET_ID, type: "widget", widgetType: "welcome", size: "1x4"/);
assert.match(app, /id: "character-phone", type: "app"[\s\S]*row: 5, column: 2/);
assert.match(app, /id: "forum", type: "app"[\s\S]*row: 5, column: 3/);
assert.match(app, /id: "reading", type: "app"[\s\S]*row: 6, column: 0/);
assert.match(app, /id: "cinema", type: "app"[\s\S]*row: 6, column: 1/);
assert.match(app, /id: "relationship-network", type: "app"[\s\S]*row: 6, column: 2/);
assert.match(app, /id: "diary", type: "app"[\s\S]*row: 6, column: 3/);
assert.match(app, /!FRESH_DESKTOP_DEFAULT_APP_IDS\.includes\(item\.id as typeof FRESH_DESKTOP_DEFAULT_APP_IDS\[number\]\)/);
assert.match(app, /if \(!raw && seedFreshDesktopDefaults\) \{[\s\S]*parsed\.push\(\.\.\.FRESH_DESKTOP_DEFAULT_APP_IDS\)/);
assert.doesNotMatch(chat, /允许对方在距离、时间和聊天上下文合理时提出见面/);

console.log("PASS Schedule is default only for untouched installs and proactive-offline helper copy is removed");
