import assert from "node:assert/strict";
import { buildRelationDiaryContext } from "../src/domain/prompt/diaryContext";
const shares = [{ id: "s", diaryEntryId: "e", ownerIdentityId: "i1", targetRelationId: "r1", conversationId: "c1", messageId: "m1", snapshot: { authorType: "user" as const, authorName: "我", title: "今天", body: "只给这一段关系看的日记", occurredAt: Date.now() }, createdAt: Date.now() }];
const visible = buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r1", conversationId: "c1", messages: [{ id: "m1", characterId: "char", relationId: "r1", conversationId: "c1", sender: "user", content: "[日记分享]", timestamp: Date.now(), diaryShareId: "s" }], shares });
const hidden = buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r2", conversationId: "c2", messages: [], shares });
assert.match(visible, /只给这一段关系看的日记/); assert.equal(hidden, "");
console.log("diary share context tests passed");
