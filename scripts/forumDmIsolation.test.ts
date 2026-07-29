import assert from "node:assert/strict";
import type { Character, ForumThread } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { removeForumDmConversationsByRelation, resolveForumDmActorFromPublicRecord } from "../src/domain/forum/forumDmData";

const character: Character = { id: "character", name: "角色", avatar: "", personality: "", backstory: "" };
const relationA: CharacterRelationship = { id: "relation-a", characterId: character.id, userIdentityId: "identity-a", conversationId: "direct:relation-a", relationship: "friend", compressedMemory: "", createdAt: 1, updatedAt: 1 };
const relationB = { ...relationA, id: "relation-b", userIdentityId: "identity-b", conversationId: "direct:relation-b" };
const thread: ForumThread = { id: "thread", ownerIdentityId: "identity-a", publicAuthor: { displayName: "角色", kind: "ai-character", isAnonymous: false }, privateAuthorRelationId: relationA.id, privateAuthorCharacterId: character.id, title: "标题", body: "正文", source: "ai-character", occurredAt: 1, baseLikeCount: 0, likedByIdentityIds: [], replyCount: 0, createdAt: 1, updatedAt: 1 };
assert.equal(resolveForumDmActorFromPublicRecord({ ownerIdentityId: "identity-a", thread, relationships: [relationA, relationB], characters: [character] })?.actor.kind, "relationship");
assert.equal(resolveForumDmActorFromPublicRecord({ ownerIdentityId: "identity-b", thread, relationships: [relationA, relationB], characters: [character] }), undefined, "other identity cannot resolve actor");
assert.equal(resolveForumDmActorFromPublicRecord({ ownerIdentityId: "identity-a", thread: { ...thread, publicAuthor: { displayName: "匿名用户", kind: "anonymous-ai", isAnonymous: true } }, relationships: [relationA, relationB], characters: [character] }), undefined, "anonymous author never opens a DM");
const cleaned = removeForumDmConversationsByRelation([{ id: "a", ownerIdentityId: "identity-a", participant: { kind: "relationship", relationId: "relation-a", characterId: character.id }, participantPublicSnapshot: thread.publicAuthor, lastMessageAt: 1, unreadCount: 0, createdAt: 1, updatedAt: 1 }, { id: "b", ownerIdentityId: "identity-b", participant: { kind: "relationship", relationId: "relation-b", characterId: character.id }, participantPublicSnapshot: thread.publicAuthor, lastMessageAt: 1, unreadCount: 0, createdAt: 1, updatedAt: 1 }], [], [], relationA.id);
assert.deepEqual(cleaned.conversations.map((item) => item.id), ["b"]);
console.log("forum dm isolation tests passed");
