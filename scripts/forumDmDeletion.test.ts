import assert from "node:assert/strict";
import { deleteForumDmConversation } from "../src/domain/forum/forumDmData";
import type { ForumDmConversation, ForumDmMessage, ForumDmTask, ForumNotification } from "../src/types";

const conversation: ForumDmConversation = { id: "c1", ownerIdentityId: "i1", participant: { kind: "virtual", virtualProfileId: "v" }, participantPublicSnapshot: { displayName: "路人", kind: "virtual", isAnonymous: false }, lastMessageAt: 1, unreadCount: 2, createdAt: 1, updatedAt: 1, revision: 1 };
const other: ForumDmConversation = { ...conversation, id: "c2" };
const messages: ForumDmMessage[] = [{ id: "m1", conversationId: "c1", ownerIdentityId: "i1", sender: "user", body: "hi", occurredAt: 1, createdAt: 1 }, { id: "m2", conversationId: "c2", ownerIdentityId: "i1", sender: "user", body: "keep", occurredAt: 1, createdAt: 1 }];
const tasks: ForumDmTask[] = [{ id: "t1", taskKey: "k", ownerIdentityId: "i1", conversationId: "c1", status: "running", startedAt: 1, createdAt: 1, updatedAt: 1 }];
const notices: ForumNotification[] = [{ id: "n1", eventKey: "n", ownerIdentityId: "i1", type: "direct-message", actorPublicSnapshot: conversation.participantPublicSnapshot, threadId: "", replyId: "m1", conversationId: "c1", preview: "hi", occurredAt: 1 }];
const deleted = deleteForumDmConversation({ conversationId: "c1", ownerIdentityId: "i1", conversations: [conversation, other], messages, tasks, notifications: notices });
assert.equal(deleted.deleted, true); assert.deepEqual(deleted.conversations.map((item) => item.id), ["c2"]); assert.deepEqual(deleted.messages.map((item) => item.id), ["m2"]); assert.equal(deleted.tasks.length, 0); assert.equal(deleted.notifications.length, 0);
assert.equal(deleteForumDmConversation({ conversationId: "c1", ownerIdentityId: "i1", ...deleted }).deleted, false, "repeated deletion is idempotent");
console.log("forum DM deletion tests passed");
