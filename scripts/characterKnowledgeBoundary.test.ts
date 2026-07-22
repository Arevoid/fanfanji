import { strict as assert } from "node:assert";
import { formatCharacterKnowledgeBoundary } from "../src/domain/prompt/characterKnowledgeBoundary";
import { buildWorldBookSystemBlocks } from "../src/utils/worldBook";
import type { WorldBookEntry } from "../src/types";

const directBoundary = formatCharacterKnowledgeBoundary({ currentCharacterId: "a" });
const groupBoundary = formatCharacterKnowledgeBoundary({
  currentCharacterId: "a",
  groupMemberIds: ["b"],
});

const worldBookEntries: WorldBookEntry[] = [
  {
    id: "a-relationship",
    title: "A 与 B 的同事关系",
    category: "relationship",
    content: "B 是 A 的同事。",
    timestamp: 1,
    characterId: "a",
    triggerType: "constant",
  },
  {
    id: "b-private",
    title: "B 的私人设定",
    category: "character",
    content: "只属于 B 的私人聊天和记忆。",
    timestamp: 1,
    characterId: "b",
    triggerType: "constant",
  },
];

const aWorldBook = buildWorldBookSystemBlocks(worldBookEntries, "a", "");

// 1. Explicit profile/world-book relationships may be understood only as written.
assert.match(directBoundary, /明确写出你与某角色的关系/);
assert.match(directBoundary, /不得补全对方人设、私人聊天、朋友圈、记忆/);
assert.match(aWorldBook.formattedAll, /B 是 A 的同事/);

// 2. Hearsay remains limited rather than becoming familiarity.
assert.match(directBoundary, /曾听用户提起某角色/);
assert.match(directBoundary, /不能表现得像与对方熟识/);

// 3. A name alone is not evidence of a relationship.
assert.match(directBoundary, /仅偶然出现一个名字不构成认识或关系/);

// 4. The supported explicit relation vocabulary is deliberately bounded by source text.
assert.match(directBoundary, /朋友、家人、同事、恋人、敌人、认识、见过/);

// 5. A character's dedicated world-book does not expose another character's private entry.
assert.doesNotMatch(aWorldBook.formattedAll, /B 的私人设定|私人聊天和记忆/);

// 6. A current-chat introduction is contextual only, never a persistent relationship write.
assert.match(directBoundary, /当前聊天中介绍陌生名字/);
assert.match(directBoundary, /不要自行建立永久关系/);

// 7. One-sided source text remains one-sided; no reciprocal profile mutation is implied.
assert.match(directBoundary, /只能按该文本理解关系/);

// Group membership is the sole additional automatic knowledge boundary.
assert.match(groupBoundary, /本群真实成员/);

console.log("Character knowledge boundary: 7 fixed acceptance checks passed");
