import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createManualKnowledgeClaim } from "../src/features/characterKnowledge/services/manualKnowledgeService";
import { memoryRecordFromKnowledgeClaim } from "../src/domain/memory/memoryModel";

const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");

const manualCinemaClaim = createManualKnowledgeClaim({
  id: "claim-cinema-scope",
  scope: {
    relationId: "relation-cinema",
    characterId: "character-cinema",
    userIdentityId: "identity-cinema",
    conversationId: "conversation-cinema",
  },
  statement: "用户与角色共同观看了一部电影。",
  sourceRecordId: "discussion-cinema",
  recordedAt: 1,
  sourceApp: "cinema",
});
assert.ok(manualCinemaClaim);
assert.equal(manualCinemaClaim.source.app, "cinema");
assert.equal(memoryRecordFromKnowledgeClaim(manualCinemaClaim).provenance.app, "cinema");

const cinemaSource = read("src/components/AppCinema.tsx");
assert.match(cinemaSource, /sourceApp: "cinema"/);
assert.match(cinemaSource, /userIdentityId: relation\.userIdentityId/);
assert.match(cinemaSource, /conversationId: relation\.conversationId/);
assert.match(cinemaSource, /sourceRecordId/);

const memorySource = read("src/components/AppMemory.tsx");
assert.match(memorySource, /sourceApp: "memory"/);
assert.match(memorySource, /userIdentityId: relation\.userIdentityId/);
assert.match(memorySource, /conversationId: relation\.conversationId/);

const momentsSource = read("src/features/moments/services/momentGenerator.ts");
assert.match(momentsSource, /userIdentityId: input\.ownerIdentityId/);

const readingSource = read("src/components/AppReading.tsx");
assert.match(readingSource, /sourceApp: "reading"/);

const forumSource = read("src/features/forum/services/forumGenerationService.ts");
assert.match(forumSource, /不得读取或猜测任何角色聊天、Memory、WorldBook/);

console.log("PASS cross-app memory source and identity scope checks");
