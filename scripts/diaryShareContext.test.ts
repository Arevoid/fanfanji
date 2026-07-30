import assert from "node:assert/strict";
import { buildRelationDiaryContext } from "../src/domain/prompt/diaryContext";

const now = Date.now();
const message = { id: "m1", characterId: "char", relationId: "r1", conversationId: "c1", sender: "user" as const, content: "[diary share]", timestamp: now, diaryShareId: "s" };

const userShares = [{ id: "s", diaryEntryId: "e", ownerIdentityId: "i1", targetRelationId: "r1", conversationId: "c1", messageId: "m1", snapshot: { authorType: "user" as const, authorName: "User", title: "Today", body: "Only this relationship can see this diary.", occurredAt: now }, createdAt: now }];
const visible = buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r1", conversationId: "c1", messages: [message], shares: userShares, now });
const hidden = buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r2", conversationId: "c2", messages: [], shares: userShares, now });
assert.match(visible, /Author role: the user/);
assert.match(visible, /Do not claim that you wrote it/);
assert.equal(hidden, "");

const characterShares = [{ ...userShares[0], snapshot: { authorType: "character" as const, authorName: "Character", body: "I found an old record.", occurredAt: now } }];
const characterVisible = buildRelationDiaryContext({ ownerIdentityId: "i1", relationId: "r1", conversationId: "c1", messages: [message], shares: characterShares, now });
assert.match(characterVisible, /Author role: the character you are speaking as/);
assert.match(characterVisible, /This is your own diary entry/);

console.log("diary share context tests passed");
