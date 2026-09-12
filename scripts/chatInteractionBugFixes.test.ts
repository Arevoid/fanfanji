import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldSendChatInputOnEnter } from "../src/features/chat/components/ChatComposer";
import { characterAvatarReplyRefusesChange, isExplicitCharacterAvatarChangeRequest, resolveCharacterAvatarChangeTiming } from "../src/features/chat/services/characterAvatarChangeIntent";
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
assert.deepEqual(resolveCharacterAvatarChangeTiming("温柔、爽快", ""), { delayMs: 900, waitForReply: false });
assert.deepEqual(resolveCharacterAvatarChangeTiming("嘴硬又傲娇", ""), { delayMs: 12_000, waitForReply: true });
assert.equal(characterAvatarReplyRefusesChange("才不换呢"), true);
assert.equal(characterAvatarReplyRefusesChange("好呀，这就换上"), false);

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
assert.match(appChat, /settlePendingCharacterAvatarChangeAfterReply/);
assert.match(appChat, /onUserMessageCreated: \(message, context\)/, "normal composer sends must reach avatar intent handling");
assert.match(appChat, /const saved = onSaveSettings\(\(previous\) => updateIdentityProfile\(previous, identity\.id, \{ name, avatar, bio \}\)\)/, "identity detail save must check persistence result");
assert.match(appChat, /resolveCanonicalCharacterId\(pending\.characterId, characters\)/, "avatar changes must target the canonical character archive");
assert.match(appChat, /角色头像已更新/, "successful explicit avatar changes should be visible to the user");
const chatController = readFileSync("src/features/chat/hooks/useChatController.ts", "utf8");
assert.match(chatController, /onUserMessageCreated\?\.\(userMessage, runtimeContext\)/, "send-only and send-and-reply must expose the created message");
const appSettings = readFileSync("src/components/AppSettings.tsx", "utf8");
assert.match(appSettings, /aria-label="键盘回车换行"/);
assert.match(appSettings, /聊天页设置/);
const chatComposer = readFileSync("src/features/chat/components/ChatComposer.tsx", "utf8");
assert.match(chatComposer, /if \(chatEnterKeyNewline\) return;/, "newline mode must block mobile form submit");
assert.match(appSettings, /const saved = handleSave\(\{ chatEnterKeyNewline: nextValue \}\)/, "newline preference must only appear enabled after persistence succeeds");
const app = readFileSync("src/App.tsx", "utf8");
assert.match(app, /const canonicalCharacterId = resolveCanonicalCharacterId\(characterId, currentCharacters\)/, "character updates must canonicalize legacy contact instances");
assert.match(app, /loadSettingsDurableOverlay/, "profile settings need an IndexedDB quota fallback");
const phone = readFileSync("src/components/AppCharacterPhone.tsx", "utf8");
assert.match(phone, /draftsByContact/);
const characterSaveSettings = readFileSync("src/features/chat/hooks/useChatSaveSettings.ts", "utf8");
assert.match(characterSaveSettings, /avatar: draftAvatar \|\| activeCharacter\.avatar/);
const imageContext = readFileSync("src/features/chat/services/recentUserImageContext.ts", "utf8");
assert.match(appChat, /resolveRecentUserImageForTurn\(\{/i, "direct turns must resolve an explicitly referenced recent image");
assert.match(imageContext, /isLikelyImageReference/);
const regenerationSource = readFileSync("src/features/chat/hooks/useChatRegenerationAction.ts", "utf8");
const regenerationScope = readFileSync("src/features/chat/services/regenerationTurnScope.ts", "utf8");
assert.match(regenerationSource, /resolveRegenerationTurnScope/);
assert.match(regenerationScope, /messagesBeforeTarget/);
const avatarResolver = readFileSync("src/features/chat/services/messageAvatarResolver.ts", "utf8");
assert.match(appChat, /resolveChatMessageAvatar\(\{/);
assert.match(avatarResolver, /isGroupChat/);

console.log("PASS chat keyboard, media, avatar intent, bubble formatting, settings and draft safeguards");
