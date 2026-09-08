import assert from "node:assert/strict";
import { removeImageGenerationRecordsByCharacter, removeImageGenerationRecordsByRelation } from "../src/core/storage/repositories/imageGenerationRepository";
import type { ImageGenerationRecord } from "../src/types";

const records: ImageGenerationRecord[] = [
  { id: "a", messageId: "m-a", characterId: "char", relationId: "rel-a", conversationId: "direct:rel-a", imageAssetId: "asset-a", trigger: "manual", createdAt: 1 },
  { id: "b", messageId: "m-b", characterId: "char", relationId: "rel-b", conversationId: "direct:rel-b", imageAssetId: "asset-b", trigger: "explicit-user-text", createdAt: 2 },
  { id: "g", messageId: "m-g", characterId: "char", groupId: "group-a", conversationId: "group:group-a", imageAssetId: "asset-g", trigger: "manual", createdAt: 3 },
];
const afterRelation = removeImageGenerationRecordsByRelation(records, "rel-a");
assert.deepEqual(afterRelation.map((record) => record.id), ["b", "g"]);
assert.equal(afterRelation.find((record) => record.id === "b")?.conversationId, "direct:rel-b");
assert.equal(removeImageGenerationRecordsByCharacter(records, "char").length, 0);
console.log("imageGenerationRelationIsolation.test passed");
