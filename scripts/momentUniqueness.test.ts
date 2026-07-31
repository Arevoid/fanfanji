import assert from "node:assert/strict";
import type { Moment } from "../src/types";
import { requestCharacterMoment } from "../src/features/moments/services/momentGenerator";
import {
  assessMomentUniqueness,
  calculateMomentTextSimilarity,
  isMomentSkipResponse,
  normalizeMomentComparisonText,
} from "../src/features/moments/services/momentUniqueness";

const makeMoment = (id: string, content: string, ownerIdentityId = "identity-1"): Moment => ({
  id,
  characterId: "character-a",
  relationId: "relation-a",
  ownerIdentityId,
  authorName: "角色 A",
  authorAvatar: "avatar.png",
  content,
  timestamp: Number(id.replace(/\D/g, "")) || 1,
  likes: [],
  comments: [],
});

const previous = makeMoment(
  "100",
  "今天下班回家，顺路买了一杯冰咖啡。路上风很大，回家后准备看书。",
);

assert.equal(
  normalizeMomentComparisonText("今天下班回家，顺路买了一杯冰咖啡。"),
  "今天下班回家顺路买了一杯冰咖啡",
);
assert.equal(calculateMomentTextSimilarity(previous.content, previous.content), 1);
assert.equal(
  assessMomentUniqueness(previous.content, [previous], { ownerIdentityId: "identity-1" }).reason,
  "duplicate",
);
assert.equal(
  assessMomentUniqueness(
    "今天下班回家，顺路买了一杯冰咖啡。路上风很大，回家后准备看电影。",
    [previous],
    { ownerIdentityId: "identity-1" },
  ).reason,
  "similar",
);
assert.equal(
  assessMomentUniqueness("把旧相机擦干净，终于找到了想拍的云。", [previous], { ownerIdentityId: "identity-1" }).accepted,
  true,
);
assert.equal(
  assessMomentUniqueness(previous.content, [makeMoment("101", previous.content, "identity-2")], { ownerIdentityId: "identity-1" }).accepted,
  true,
  "不同身份的朋友圈历史不能互相拦截",
);
assert.equal(isMomentSkipResponse("SKIP"), true);
assert.equal(isMomentSkipResponse("没有合适内容。"), true);
assert.equal(isMomentSkipResponse("今天想去散步"), false);

const character = {
  id: "character-a",
  name: "角色 A",
  avatar: "avatar.png",
  personality: "安静",
  backstory: "喜欢观察生活。",
};
const request = { message: "m", history: [], systemInstruction: "s", apiKey: "", model: "test" };
const parseContent = (content: string) => ({ content, selfComments: [] as string[] });

const duplicateGenerated = await requestCharacterMoment({
  requestAi: async () => ({ text: previous.content }),
  request,
  character,
  ownerIdentityId: "identity-1",
  relationId: "relation-a",
  existingMoments: [previous],
  parseContent,
  now: () => 200,
  random: () => 0.1,
});
assert.deepEqual(duplicateGenerated, {}, "重复正文不能进入发布链路");

const skippedGenerated = await requestCharacterMoment({
  requestAi: async () => ({ text: "SKIP" }),
  request,
  character,
  ownerIdentityId: "identity-1",
  relationId: "relation-a",
  existingMoments: [previous],
  parseContent,
  now: () => 201,
  random: () => 0.1,
});
assert.deepEqual(skippedGenerated, {}, "模型判断没有新内容时不应发布空动态");

console.log("PASS Moment duplicate/similarity filtering, identity isolation, and SKIP publication behavior");
