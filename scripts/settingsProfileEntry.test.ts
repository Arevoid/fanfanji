import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const homeStart = settings.indexOf("{activeTab === null ? (");
const profileStart = settings.indexOf('{activeTab === "profile"');
assert.ok(homeStart >= 0 && profileStart > homeStart);

const settingsHome = settings.slice(homeStart, profileStart);
assert.doesNotMatch(settingsHome, /QQ Style User Profile Card/);
assert.match(settingsHome, /data-welcome-widget-profile-card/);
assert.match(settingsHome, /welcomeWidgetProfile\.avatar/);
assert.doesNotMatch(settingsHome, /独立于“我的人设”/);
assert.doesNotMatch(settingsHome, /setActiveTab\("profile"\)/);
assert.doesNotMatch(settingsHome, />人设资料<\/span>/);
assert.match(settings, /saveWelcomeWidgetProfile\(WELCOME_WIDGET_ID, welcomeWidgetDraft\)/);
assert.match(settings, /与桌面置顶欢迎卡片同步，不影响任何人设/);

console.log("settings home keeps the welcome profile card without extra copy or persona entry");
