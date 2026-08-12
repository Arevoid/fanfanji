import assert from "node:assert/strict";
import fs from "node:fs";
import { getNotificationChatTarget, isNotificationForActiveChat } from "../src/features/chat/services/chatNotificationScope";

const direct = { characterId: "character-b", relationId: "relation-b", conversationId: "direct:relation-b" };
assert.deepEqual(getNotificationChatTarget(direct), { characterId: "character-b", relationId: "relation-b" });
assert.equal(isNotificationForActiveChat(direct, { characterId: "character-b", relationId: "relation-a" }), false,
  "matching only the displayed character must not retain another relationship's history");
assert.equal(isNotificationForActiveChat(direct, { characterId: "character-b", relationId: "relation-b" }), true);

const group = { characterId: "group-b", relationId: null, conversationId: "group:group-b" };
assert.deepEqual(getNotificationChatTarget(group), { characterId: "group-b", relationId: null },
  "opening a group notification must clear any stale direct relation");
assert.equal(isNotificationForActiveChat(group, { characterId: "group-b", relationId: "relation-a" }), false);

const appSource = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chatSource = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(appSource, /setActiveChatRelationId\(target\.relationId\)/,
  "notification navigation must switch the relationship together with the displayed character");
assert.match(chatSource, /context: replyContext/,
  "async direct replies must carry the request's captured relationship scope");
assert.match(chatSource, /activeCharacter && isActiveChatScopeValid/,
  "a mismatched character and relationship must never render as one conversation");

console.log("chat notification scope tests passed");
