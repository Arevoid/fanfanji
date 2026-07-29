import assert from "node:assert/strict";
import { DEFAULT_FORUM_POST_AUTHOR_POLICY, canUseRelationshipThreadAuthor, chooseForumThreadAuthorKind } from "../src/domain/forum/forumPostAuthorPolicy";
import type { ForumThread } from "../src/types";

const thread = (id: string, occurredAt: number, relationId?: string, anonymous = false): ForumThread => ({ id, ownerIdentityId: "identity", publicAuthor: { displayName: anonymous ? "匿名用户" : relationId ? "朋友" : "路人", kind: anonymous ? "anonymous-ai" : relationId ? "ai-character" : "virtual", isAnonymous: anonymous }, ...(relationId ? { privateAuthorRelationId: relationId, privateAuthorCharacterId: "character" } : {}), title: id, body: "公开正文", source: relationId ? anonymous ? "ai-character-anonymous" : "ai-character" : "ai-virtual", occurredAt, baseLikeCount: 0, likedByIdentityIds: [], replyCount: 0, createdAt: occurredAt, updatedAt: occurredAt });

let cursor = 0;
const values = Array.from({ length: 1000 }, (_, index) => (index + 0.5) / 1000);
const rng = () => values[cursor++ % values.length];
const kinds = Array.from({ length: 1000 }, () => chooseForumThreadAuthorKind({ relationAvailable: true, relationshipAllowed: true, random: rng }));
assert.ok(kinds.filter((kind) => kind === "virtual").length > 650, "NPC is the dominant long-run main-post author");
assert.ok(kinds.filter((kind) => kind === "relationship").length > 250 && kinds.filter((kind) => kind === "relationship").length < 350);
const now = 200 * 60 * 60 * 1000;
const recent = [thread("a", now - 1, "r1"), thread("b", now - 2, "r2"), thread("c", now - 3, "r3")];
assert.equal(canUseRelationshipThreadAuthor({ relationId: "r4", threads: recent, now }), false, "recent relationship cap protects the window");
assert.equal(canUseRelationshipThreadAuthor({ relationId: "r1", threads: [thread("same", now - 1, "r1")], now }), false, "same relation cannot post consecutively or bypass cooldown");
assert.equal(canUseRelationshipThreadAuthor({ relationId: "r1", threads: [thread("old", now - DEFAULT_FORUM_POST_AUTHOR_POLICY.relationshipPostCooldownMs - 1, "r1")], now }), true);
console.log("forum post distribution tests passed");
