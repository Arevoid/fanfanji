import assert from "node:assert/strict";
import type { ForumActorRef, ForumDmConversation } from "../src/types";
import { appendForumDmMessage, markForumDmRead, openForumDmConversation } from "../src/domain/forum/forumDmData";

const actor: ForumActorRef = { kind: "virtual", virtualProfileId: "forum-npc-01" };
const author = { displayName: "NPC", kind: "virtual" as const, isAnonymous: false };
const opened = openForumDmConversation({ ownerIdentityId: "identity-a", conversations: [], actor, publicAuthor: author, now: 1 });
const reopened = openForumDmConversation({ ownerIdentityId: "identity-a", conversations: opened.conversations, actor, publicAuthor: author, now: 2 });
assert.equal(opened.conversation.id, reopened.conversation.id, "same actor reuses stable conversation");
const user = appendForumDmMessage({ messages: [], conversations: opened.conversations, conversationId: opened.conversation.id, ownerIdentityId: "identity-a", sender: "user", body: "你好", now: 3 });
assert.equal(user.messages.length, 1);
const incoming = appendForumDmMessage({ messages: user.messages, conversations: user.conversations, conversationId: opened.conversation.id, ownerIdentityId: "identity-a", sender: "participant", body: "你好", now: 4 });
assert.equal(incoming.conversations[0].unreadCount, 1);
assert.equal(markForumDmRead(incoming.conversations, opened.conversation.id)[0].unreadCount, 0);
console.log("forum dm data tests passed");
