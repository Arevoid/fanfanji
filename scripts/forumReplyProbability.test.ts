import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FORUM_AUTHOR_UPDATE_PROBABILITY,
  FORUM_RELATION_REPLY_PROBABILITY,
} from "../src/domain/forum/forumGenerationGuard";
import { selectForumReplyAuthors } from "../src/features/forum/services/forumGenerationService";
import type { ForumRelationContext } from "../src/features/forum/services/forumGenerationService";

const relationContext = {
  relationship: { id: "relation-1" },
  character: { id: "character-1", name: "角色", remark: "角色", avatar: "" },
  promptContext: "以角色的公开语气回复",
} as ForumRelationContext;

const relationAuthors = selectForumReplyAuthors({
  count: 2,
  relationContexts: [relationContext],
  random: () => 0.1,
  seed: "relation-reply",
});
assert.equal(relationAuthors.some((author) => author.kind === "relation"), true);

const virtualAuthors = selectForumReplyAuthors({
  count: 2,
  relationContexts: [relationContext],
  random: () => 0.99,
  seed: "virtual-reply",
});
assert.equal(virtualAuthors.every((author) => author.kind === "virtual"), true);
assert.equal(FORUM_RELATION_REPLY_PROBABILITY, 0.6);
assert.equal(FORUM_AUTHOR_UPDATE_PROBABILITY, 0.65);

const service = readFileSync(new URL("../src/features/forum/services/forumGenerationService.ts", import.meta.url), "utf8");
assert.match(service, /random\(\)\s*<\s*FORUM_AUTHOR_UPDATE_PROBABILITY/);

console.log("PASS relation and author reply probabilities are increased without changing actor isolation");
