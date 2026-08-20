import assert from "node:assert/strict";
import { describeReadingStoryIdentity, validateReadingStorySetup } from "../src/features/reading/story/readingStorySetup";

const body = { entryMode: "body_wear" as const, name: "林舟", gender: "女", age: "22", role: "医师", persona: "谨慎", goal: "找到出口" };
assert.equal(validateReadingStorySetup({ mode: "solo", user: body, length: "short" }), null);
assert.match(describeReadingStoryIdentity(body), /身穿原创角色：林舟/);
assert.match(describeReadingStoryIdentity(body), /22岁/);

assert.match(validateReadingStorySetup({ mode: "together", user: body, friend: body, length: "medium" }) || "", /请选择/);
assert.match(validateReadingStorySetup({ mode: "solo", user: { entryMode: "soul_wear", name: "原主" }, length: "long" }) || "", /原故事角色/);
assert.equal(validateReadingStorySetup({ mode: "together", relationId: "relation-a", user: { entryMode: "soul_wear", name: "原主", originalCharacterId: "character-original" }, friend: body, length: "medium" }), null);

console.log("reading story setup validation tests passed");
