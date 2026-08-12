import assert from "node:assert/strict";
import { calculateCharacterMomentOccurredAt, requestCharacterMoment } from "../src/features/moments/services/momentGenerator";
import { requestAutomaticMomentComment } from "../src/features/moments/services/momentCommentService";
import { requestMomentCommentReply } from "../src/features/moments/services/momentReplyService";
import type { Character } from "../src/types";
import { appendMomentPublicPromptContext } from "../src/features/characterCognitive/promptAdapters/momentPromptAdapter";

const character: Character = { id: "c1", name: "阿岚", avatar: "a.png", personality: "温柔", backstory: "测试" };
const request = { message: "m", history: [], systemInstruction: "s", apiKey: "", model: "test" };
const requestAi = async () => ({ text: "[语音|3]你好" });
const emptyRequest = async () => ({ text: "" });
const parse = (content: string) => ({ content, selfComments: ["自评"], imageDescription: undefined });
const clean = (content: string) => content;

const post = await requestCharacterMoment({ requestAi, request, character, ownerIdentityId: "identity-1", relationId: "relation-a", parseContent: parse, occurredAt: () => 10, random: () => 0.1 });
assert.equal(post.moment?.content, "你好");
assert.equal(post.moment?.comments[0].content, "自评");
assert.ok(post.memory?.content.includes("你好"));
assert.equal(post.moment?.relationId, "relation-a");
assert.equal(post.moment?.timestamp, 10);
assert.equal(post.moment?.comments[0].timestamp, 1010);
assert.equal(post.memory?.relationId, "relation-a");
assert.equal(post.memory?.timestamp, 10);

const longAwayNow = 1_000_000_000;
const relationOneOccurredAt = calculateCharacterMomentOccurredAt({
  now: longAwayNow,
  relationId: "relation-one",
  lastMomentAt: longAwayNow - 300_000_000,
  intervalMs: 86_400_000,
});
const relationTwoOccurredAt = calculateCharacterMomentOccurredAt({
  now: longAwayNow,
  relationId: "relation-two",
  lastMomentAt: longAwayNow - 300_000_000,
  intervalMs: 86_400_000,
});
assert.ok(relationOneOccurredAt >= longAwayNow - 213_600_000 && relationOneOccurredAt <= longAwayNow);
assert.notEqual(relationOneOccurredAt, relationTwoOccurredAt, "separate relationships spread their generated occurrence times");
assert.equal(calculateCharacterMomentOccurredAt({
  now: longAwayNow,
  relationId: "relation-one",
  lastMomentAt: longAwayNow - 86_400_000 - 1_000,
  intervalMs: 86_400_000,
}), longAwayNow, "frequent app opens remain near now");
assert.deepEqual(await requestCharacterMoment({ requestAi: emptyRequest, request, character, ownerIdentityId: "identity-1", parseContent: parse }), {});
const comment = await requestAutomaticMomentComment({ requestAi, request, character, cleanText: clean, now: () => 20, random: () => 0.2 });
assert.equal(comment?.content, "你好");
assert.equal(await requestAutomaticMomentComment({ requestAi: emptyRequest, request, character, cleanText: clean }), undefined);
const reply = await requestMomentCommentReply({ requestAi: async () => ({ text: "回复小林：[voice|6]你好" }), request, character, userName: "小林", cleanText: clean, now: () => 30, random: () => 0.3 });
assert.equal(reply?.content, "回复小林：你好");
assert.equal(await requestMomentCommentReply({ requestAi: emptyRequest, request, character, userName: "小林", cleanText: clean }), undefined);

const anchored = appendMomentPublicPromptContext({ ...request, systemInstruction: "BASE\n\n[FINAL OUTPUT LANGUAGE — HIGHEST PRIORITY]\nJapanese only" }, {
  schemaVersion: 1,
  createdAt: new Date("2026-08-11T12:00:00+08:00").getTime(),
  publicCharacterProfile: { name: "阿岚", personality: "温柔", backstory: "测试" },
  authorizedPublicFacts: [],
  publicEvents: [],
  publicMomentHistory: [],
  publicCommentHistory: [],
  publicBehaviorConstraints: [],
  currentTime: { now: new Date("2026-08-11T12:00:00+08:00").getTime(), date: "2026-08-11", time: "12:00" },
});
assert.match(anchored.systemInstruction || "", /PUBLIC-SAFE MOMENT COGNITIVE CONTEXT/);
assert.equal(anchored.systemInstruction?.endsWith("Japanese only"), true, "Moment adapter must keep final language anchor last");
console.log("PASS character Moment, auto-comment, reply, text-only voice-tag cleanup, empty response, and stable creation checks");
