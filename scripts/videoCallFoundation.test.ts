import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const state = readFileSync(new URL("../src/features/chat/hooks/useChatAttachmentState.ts", import.meta.url), "utf8");
const view = readFileSync(new URL("../src/features/chat/components/VideoCallView.tsx", import.meta.url), "utf8");

assert.match(state, /ChatCallMode = "voice" \| "video"/);
assert.match(state, /VideoCallInputMode = "speech" \| "scene"/);
assert.match(appChat, /chat-attachment-item--video/);
assert.match(appChat, /beginVideoCall/);
assert.match(appChat, /callMode === "video"/);
assert.match(appChat, /<VideoCallView/);
assert.match(appChat, /onClick=\{\(\) => beginVideoCall\(false\)\}/);
assert.match(appChat, /sendVideoCameraFrame/);
assert.match(view, /data-video-call-view/);
assert.match(view, /data-video-call-self-preview/);
assert.match(view, /onCameraFrame/);
assert.match(view, /switchCamera/);
assert.match(view, /facingMode/);
assert.doesNotMatch(view, /cameraAutoCapturePendingRef/);
assert.doesNotMatch(view, /锁定视频通话/);
assert.match(view, /切换说话和画面描述/);
assert.match(view, /挂断视频通话/);
console.log("PASS video-call foundation exposes the attachment entry and isolated call surface");
