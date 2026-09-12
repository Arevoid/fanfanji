import assert from "node:assert/strict";
import { resolveChatMessageAvatar } from "../src/features/chat/services/messageAvatarResolver";

const base = {
  isSelf: true,
  isGroupChat: false,
  messageAvatarSnapshot: "old-avatar",
  messageAuthorIdentityId: "identity-a",
  currentIdentityId: "identity-a",
  currentIdentityAvatar: "new-avatar",
};
assert.equal(resolveChatMessageAvatar(base), "new-avatar", "direct self bubbles follow the current identity avatar");
assert.equal(resolveChatMessageAvatar({ ...base, isGroupChat: true }), "old-avatar", "group snapshots remain frozen");
assert.equal(resolveChatMessageAvatar({ ...base, messageAuthorIdentityId: "identity-b" }), "old-avatar", "foreign identity snapshots remain frozen");
assert.equal(resolveChatMessageAvatar({ ...base, messageAuthorIdentityId: undefined }), "new-avatar", "legacy direct messages use the current profile");
assert.equal(resolveChatMessageAvatar({ ...base, isSelf: false, fallbackAvatar: "character-avatar" }), "character-avatar");

console.log("PASS direct avatar display follows the active profile without rewriting history");
