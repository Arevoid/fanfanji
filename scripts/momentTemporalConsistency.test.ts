import assert from "node:assert/strict";
import {
  calculateCharacterMomentOccurredAt,
  requestCharacterMoment,
} from "../src/features/moments/services/momentGenerator";
import { requestAutomaticMomentComment } from "../src/features/moments/services/momentCommentService";
import { requestMomentCommentReply } from "../src/features/moments/services/momentReplyService";
import {
  createMomentTemporalContext,
  findMomentTemporalConflicts,
  formatMomentTemporalContext,
} from "../src/features/moments/services/momentTemporalContext";
import type { Character } from "../src/types";

const july26 = new Date(2026, 6, 26, 12, 0);
const julyContext = createMomentTemporalContext(july26);
const character: Character = {
  id: "temporal-character",
  name: "测试角色",
  avatar: "avatar.png",
  personality: "平静",
  backstory: "生日是11月7日。",
};

assert.equal(julyContext.currentDate, "2026-07-26");
assert.equal(julyContext.currentSeason, "夏季");
assert.equal(julyContext.currentSolarTerm, "大暑");
assert.match(formatMomentTemporalContext(julyContext, character), /2026-07-26/);
assert.match(formatMomentTemporalContext(julyContext, character), /大暑/);
assert.match(formatMomentTemporalContext(julyContext, character), /12:00/);

for (const invalidContent of ["今天立冬，生日。", "初雪落下了", "冬季的第一场雨", "圣诞快乐", "春节的烟花真热闹", "寒潮来了"]) {
  assert.ok(
    findMomentTemporalConflicts(invalidContent, julyContext, character).length > 0,
    `${invalidContent} must be rejected in July`,
  );
}
assert.deepEqual(findMomentTemporalConflicts("盛夏的雨停了，出去买杯冰咖啡。", julyContext, character), []);
assert.ok(findMomentTemporalConflicts("发现一张今晚的月亮。", julyContext, character).length > 0);
assert.deepEqual(findMomentTemporalConflicts("去年立冬时拍的照片，今天翻出来了。", julyContext, character), []);
assert.ok(findMomentTemporalConflicts("今天是我的生日。", julyContext, character).length > 0);
assert.deepEqual(
  findMomentTemporalConflicts("凌晨两点半 刚训练完", createMomentTemporalContext(new Date(2026, 6, 15, 10, 43))),
  ["explicit clock time conflicts with the Moment occurrence time"],
);
assert.deepEqual(
  findMomentTemporalConflicts("凌晨三点了还在翻旧物料", createMomentTemporalContext(new Date(2026, 6, 20, 0, 46))),
  ["explicit clock time conflicts with the Moment occurrence time"],
);
assert.deepEqual(
  findMomentTemporalConflicts("凌晨两点半 刚训练完", createMomentTemporalContext(new Date(2026, 6, 15, 2, 35))),
  [],
);

const birthdayContext = createMomentTemporalContext(new Date(2026, 10, 7, 12, 0));

const eveningNow = new Date(2026, 6, 31, 18, 41).getTime();
const eveningOccurredAt = calculateCharacterMomentOccurredAt({
  now: eveningNow,
  relationId: "evening-relation",
  lastMomentAt: eveningNow - 7 * 24 * 60 * 60 * 1000,
  intervalMs: 24 * 60 * 60 * 1000,
});
assert.ok(eveningOccurredAt >= new Date(2026, 6, 31, 17, 0).getTime());
assert.deepEqual(findMomentTemporalConflicts("今天是我的生日。", birthdayContext, character), []);

const request = { message: "m", history: [], systemInstruction: "s", apiKey: "", model: "test" };
const rejected = await requestCharacterMoment({
  requestAi: async () => ({ text: "今天立冬，生日。" }),
  request,
  character,
  ownerIdentityId: "identity-1",
  parseContent: (content) => ({ content, selfComments: [] }),
  now: () => july26.getTime(),
  random: () => 0.1,
  temporalContext: julyContext,
});
assert.deepEqual(rejected, {}, "an invalid generated post must never be persisted");

const earlyMorningContext = createMomentTemporalContext(new Date(2026, 6, 31, 7, 18));
const rejectedFutureDaypart = await requestCharacterMoment({
  requestAi: async () => ({ text: "\u53d1\u73b0\u4e00\u5f20\u4eca\u665a\u7684\u6708\u4eae\u3002" }),
  request,
  character,
  ownerIdentityId: "identity-1",
  parseContent: (content) => ({ content, selfComments: [] }),
  now: () => new Date(2026, 6, 31, 7, 18).getTime(),
  random: () => 0.1,
  temporalContext: earlyMorningContext,
});
assert.deepEqual(rejectedFutureDaypart, {}, "a morning Moment must not claim a later evening event");

const rejectedSelfComment = await requestCharacterMoment({
  requestAi: async () => ({ text: "盛夏散步真舒服" }),
  request,
  character,
  ownerIdentityId: "identity-1",
  parseContent: (content) => ({ content, selfComments: ["今天立冬，生日。"] }),
  now: () => july26.getTime(),
  random: () => 0.1,
  temporalContext: julyContext,
});
assert.deepEqual(rejectedSelfComment, {}, "an invalid generated self-comment must never be persisted");

const rejectedComment = await requestAutomaticMomentComment({
  requestAi: async () => ({ text: "立冬快乐" }),
  request,
  character,
  cleanText: (content) => content,
  now: () => july26.getTime(),
  random: () => 0.1,
  temporalContext: julyContext,
});
assert.equal(rejectedComment, undefined, "an invalid generated comment must not be persisted");

const rejectedReply = await requestMomentCommentReply({
  requestAi: async () => ({ text: "圣诞快乐" }),
  request,
  character,
  userName: "用户",
  cleanText: (content) => content,
  now: () => july26.getTime(),
  random: () => 0.1,
  temporalContext: julyContext,
});
assert.equal(rejectedReply, undefined, "an invalid generated reply must not be persisted");

const accepted = await requestCharacterMoment({
  requestAi: async () => ({ text: "盛夏的雨停了，出去买杯冰咖啡。" }),
  request,
  character,
  ownerIdentityId: "identity-1",
  parseContent: (content) => ({ content, selfComments: [] }),
  now: () => july26.getTime(),
  random: () => 0.1,
  temporalContext: julyContext,
});
assert.equal(accepted.moment?.content, "盛夏的雨停了，出去买杯冰咖啡。");

console.log("PASS moment current-time context, seasonal/holiday guards, birthday checks, and publication rejection");
