import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clampFloatingCallPosition } from "../src/features/chat/services/floatingCallPosition";

assert.deepEqual(clampFloatingCallPosition({ left: -200, top: 900 }, { width: 375, height: 640 }), { left: 8, top: 484 });
assert.deepEqual(clampFloatingCallPosition({ left: 500, top: 600 }, { width: 90, height: 100 }), { left: 0, top: 0 });
assert.deepEqual(clampFloatingCallPosition({ left: 100, top: 200 }, { width: 375, height: 640 }), { left: 100, top: 200 });
assert.deepEqual(clampFloatingCallPosition({ left: NaN, top: Infinity }, { width: 375, height: 640 }), { left: 8, top: 8 });
// Re-clamp a saved position after rotation or keyboard resize.
assert.deepEqual(clampFloatingCallPosition({ left: 300, top: 500 }, { width: 320, height: 300 }), { left: 208, top: 144 });
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const video = readFileSync(new URL("../src/features/chat/components/VideoCallView.tsx", import.meta.url), "utf8");
const mini = readFileSync(new URL("../src/features/chat/components/FloatingVideoCallPreview.tsx", import.meta.url), "utf8");
assert.ok(app.indexOf("<AppChat") < app.indexOf('{activeApp === null ? ('), "chat runtime must be outside the desktop/app conditional");
assert.match(app, /data-call-overlay-host/);
assert.ok(chat.indexOf("<VideoCallView") < chat.indexOf("Active Chat Windows Overlay"), "call must survive returning to the chat list");
assert.match(chat, /callOverlayTarget && createPortal/);
assert.match(chat, /setConversationHiddenForCall\(true\)/);
assert.match(chat, /onRestore=\{\(\) => \{ setConversationHiddenForCall\(false\); onNavigateToApp\("chat"\)/);
assert.match(video, /display: minimized \? "none" : undefined/);
assert.match(video, /aria-label="缩小视频通话"/);
assert.match(mini, /Math.hypot\(dx, dy\) > 6/);
assert.match(mini, /if \(!suppressClick.current\) onRestore\(\)/);
assert.match(mini, /ResizeObserver/);
assert.match(mini, /setPointerCapture/);
assert.doesNotMatch(mini, /track.stop\(|onEnd|apiChat|fetch\(/, "mini window cannot own call termination or provider requests");
console.log("PASS floating video bounds, retained runtime, scoped restore and drag/tap separation");

assert.match(app, /display: activeApp === "chat" \? "none" : undefined/, "empty secondary-app viewport must not cover the retained chat shell");
assert.match(mini, /border: 0/, "floating preview has no outer border");
