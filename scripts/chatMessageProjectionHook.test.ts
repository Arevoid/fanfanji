import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isVisibleChatMessage, projectChatDisplayMessage } from "../src/features/chat/services/chatDisplayProjection";
import type { Message } from "../src/types";

const hook = readFileSync(new URL("../src/features/chat/hooks/useChatMessageProjection.ts", import.meta.url), "utf8");
const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");

assert.match(hook, /useMemo/);
assert.match(hook, /isVisibleChatMessage/);
assert.match(appChat, /projectChatDisplayMessage\(msg\)/);
assert.match(hook, /currentChatMessages/);
assert.match(hook, /visibleChatMessages/);
assert.match(appChat, /useChatMessageProjection/);
assert.doesNotMatch(appChat, /const visibleChatMessages = currentChatMessages\s*\n\s*\.map/);

const original = { id: "projection", characterId: "test", sender: "user", content: "正常消息", timestamp: 1 } as Message;
assert.equal(isVisibleChatMessage(original), true);
assert.equal(isVisibleChatMessage({ ...original, content: "  " }), false);
const projected = projectChatDisplayMessage(original);
assert.notEqual(projected, original);
assert.equal(projectChatDisplayMessage(original), projected);
assert.equal(original.content, "正常消息");
original.content = "编辑后";
assert.equal(projectChatDisplayMessage(original).content, "编辑后");

console.log("PASS active chat message projection is isolated behind its hook");
