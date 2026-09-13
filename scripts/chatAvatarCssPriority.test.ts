import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

// Avatar-targeting custom CSS is an explicit opt-in that wins over the
// built-in consecutive-avatar preference.
assert.match(appChat, /const customCssTargetsAvatar = userCustomChatCssSources\.some/);
assert.match(appChat, /\|\| customCssTargetsAvatar;/);

// Both bubble layouts keep a real avatar node mounted and expose stable hooks
// instead of replacing consecutive avatars with an empty spacer/omitting the
// header entirely.
assert.match(appChat, /cv-avatar-header--collapsed hidden/);
assert.match(appChat, /cv-avatar-slot--collapsed/);
assert.equal((appChat.match(/data-avatar-collapsed=\{avatarCollapseState\}/g) || []).length, 2);
assert.doesNotMatch(appChat, /\{showAvatar \? \(/);
assert.doesNotMatch(appChat, /\{showAvatar && \(/);

console.log("PASS consecutive avatars remain CSS-overridable without changing the default setting");
