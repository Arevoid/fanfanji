import assert from "node:assert/strict";
import { requestCharacterMoment } from "../src/features/moments/services/momentGenerator";
import { requestAutomaticMomentComment } from "../src/features/moments/services/momentCommentService";
import { requestMomentCommentReply } from "../src/features/moments/services/momentReplyService";
import type { Character } from "../src/types";

const character: Character = { id: "c1", name: "阿岚", avatar: "a.png", personality: "温柔", backstory: "测试" };
const request = { message: "m", history: [], systemInstruction: "s", apiKey: "", model: "test" };
const requestAi = async () => ({ text: "你好" });
const emptyRequest = async () => ({ text: "" });
const parse = (content: string) => ({ content, selfComments: ["自评"], imageDescription: undefined });
const clean = (content: string) => content;

const post = await requestCharacterMoment({ requestAi, request, character, ownerIdentityId: "identity-1", parseContent: parse, now: () => 10, random: () => 0.1 });
assert.equal(post.moment?.content, "你好");
assert.equal(post.moment?.comments[0].content, "自评");
assert.ok(post.memory?.content.includes("你好"));
assert.deepEqual(await requestCharacterMoment({ requestAi: emptyRequest, request, character, ownerIdentityId: "identity-1", parseContent: parse }), {});
const comment = await requestAutomaticMomentComment({ requestAi, request, character, cleanText: clean, now: () => 20, random: () => 0.2 });
assert.equal(comment?.content, "你好");
assert.equal(await requestAutomaticMomentComment({ requestAi: emptyRequest, request, character, cleanText: clean }), undefined);
const reply = await requestMomentCommentReply({ requestAi: async () => ({ text: "回复小林：你好" }), request, character, userName: "小林", cleanText: clean, now: () => 30, random: () => 0.3 });
assert.equal(reply?.content, "回复小林：你好");
assert.equal(await requestMomentCommentReply({ requestAi: emptyRequest, request, character, userName: "小林", cleanText: clean }), undefined);
console.log("PASS character Moment, auto-comment, reply, empty response, and stable creation checks");
