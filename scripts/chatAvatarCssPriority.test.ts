import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

// Avatar sizing selectors alone must not bypass the built-in consecutive-
// avatar preference; the setting remains the source of truth by default.
assert.doesNotMatch(appChat, /customCssTargetsAvatar/);
const showAvatarBlock = appChat.match(/const showAvatar =([\s\S]*?)const isAvatarCollapsed/);
const showAvatarExpression = showAvatarBlock?.[1] ?? "";
assert.ok(showAvatarBlock, "AppChat must keep one explicit showAvatar decision");
assert.match(showAvatarExpression, /!shouldCollapse/);
assert.doesNotMatch(showAvatarExpression, /customCss/);

// Both bubble layouts keep a real avatar node mounted and expose stable hooks
// instead of replacing consecutive avatars with an empty spacer/omitting the
// header entirely.
assert.match(appChat, /cv-avatar-header--collapsed hidden/);
assert.match(appChat, /cv-avatar-slot--collapsed/);
assert.equal((appChat.match(/data-avatar-collapsed=\{avatarCollapseState\}/g) || []).length, 2);
assert.doesNotMatch(appChat, /\{showAvatar \? \(/);
assert.doesNotMatch(appChat, /\{showAvatar && \(/);

console.log("PASS consecutive avatars remain CSS-overridable without changing the default setting");
