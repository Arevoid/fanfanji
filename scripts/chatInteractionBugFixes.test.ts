import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldSendChatInputOnEnter } from "../src/features/chat/components/ChatComposer";
import { isExplicitCharacterAvatarChangeRequest } from "../src/features/chat/services/characterAvatarChangeIntent";
import { splitIntoWeChatBubbles } from "../src/utils/pngParser";

assert.equal(shouldSendChatInputOnEnter({ key: "Enter", hasText: true, isTyping: false }), true);
assert.equal(shouldSendChatInputOnEnter({ key: "Enter", hasText: true, isTyping: false, chatEnterKeyNewline: true }), false);
assert.equal(shouldSendChatInputOnEnter({ key: "Enter", shiftKey: true, hasText: true, isTyping: false }), false);
assert.equal(shouldSendChatInputOnEnter({ key: "Enter", hasText: false, isTyping: false }), false);
assert.equal(shouldSendChatInputOnEnter({ key: "Enter", hasText: true, isTyping: true }), false);

assert.equal(isExplicitCharacterAvatarChangeRequest("你换一个头像吧"), true);
assert.equal(isExplicitCharacterAvatarChangeRequest("我们用情侣头像"), true);
assert.equal(isExplicitCharacterAvatarChangeRequest("这张照片好看吗"), false);
assert.equal(isExplicitCharacterAvatarChangeRequest("我换个话题"), false);

assert.deepEqual(
  splitIntoWeChatBubbles("第一件事已经办好了。\n第二件事等明天再说。"),
  ["第一件事已经办好了。", "第二件事等明天再说。"],
);
assert.deepEqual(
  splitIntoWeChatBubbles("这是同一句话，\n只是为了排版换行"),
  ["这是同一句话，\n只是为了排版换行"],
);

const appChat = readFileSync("src/components/AppChat.tsx", "utf8");
assert.match(appChat, /sendCustomMessage\(compressed, capturedContext, \{ triggerReply: false \}\)/);
assert.match(appChat, /isExplicitCharacterAvatarChangeRequest/);
const appSettings = readFileSync("src/components/AppSettings.tsx", "utf8");
assert.match(appSettings, /aria-label="键盘回车换行"/);
assert.match(appSettings, /聊天页设置/);
const phone = readFileSync("src/components/AppCharacterPhone.tsx", "utf8");
assert.match(phone, /draftsByContact/);
const characterSaveSettings = readFileSync("src/features/chat/hooks/useChatSaveSettings.ts", "utf8");
assert.match(characterSaveSettings, /avatar: draftAvatar \|\| activeCharacter\.avatar/);

console.log("PASS chat keyboard, media, avatar intent, bubble formatting, settings and draft safeguards");
