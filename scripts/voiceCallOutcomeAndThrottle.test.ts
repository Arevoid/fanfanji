import assert from "node:assert/strict";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import {
  PROACTIVE_CALL_MAX_PER_DAY,
  PROACTIVE_CALL_MIN_COOLDOWN_MS,
  PROACTIVE_CALL_EMOTIONAL_RETRY_DELAY_MS,
  canTriggerProactiveVoiceCall,
  createProactiveCallRejectionPatch,
  createProactiveCallTriggerPatch,
  getLocalDayKey,
  isExplicitCallBoundary,
  isEmotionallyChargedCallContext,
  resolveOutgoingCallResolution,
} from "../src/features/chat/services/proactiveVoiceCallPolicy";

const now = new Date(2026, 7, 10, 14, 0, 0).getTime();
const relation = createRelationship({ id: "r1", characterId: "c1", userIdentityId: "u1", now: now - 24 * 60 * 60 * 1000 });

assert.equal(canTriggerProactiveVoiceCall({ now, relation, startTime: "09:00", endTime: "22:00", randomValue: 0 }), true);
assert.equal(canTriggerProactiveVoiceCall({ now, relation, latestMessageAt: now - 5 * 60 * 1000, randomValue: 0 }), false, "recent chat suppresses a call");
assert.equal(canTriggerProactiveVoiceCall({ now, relation: { ...relation, lastProactiveCallAt: now - PROACTIVE_CALL_MIN_COOLDOWN_MS + 1 }, randomValue: 0 }), false, "persisted cooldown suppresses a call");
assert.equal(canTriggerProactiveVoiceCall({ now, relation: { ...relation, proactiveCallBackoffUntil: now + 1 }, randomValue: 0 }), false, "rejection backoff suppresses a call");
assert.equal(canTriggerProactiveVoiceCall({ now, relation: { ...relation, proactiveCallDayKey: getLocalDayKey(now), proactiveCallCount: PROACTIVE_CALL_MAX_PER_DAY }, randomValue: 0 }), false, "daily cap suppresses a call");
assert.equal(canTriggerProactiveVoiceCall({ now: new Date(2026, 7, 10, 2, 0, 0).getTime(), relation, startTime: "09:00", endTime: "22:00", randomValue: 0 }), false, "quiet hours suppress a call");

const emotionalRetryRelation = {
  ...relation,
  lastProactiveCallAt: now - PROACTIVE_CALL_EMOTIONAL_RETRY_DELAY_MS - 1,
  proactiveCallRetryAvailable: true,
};
assert.equal(canTriggerProactiveVoiceCall({ now, relation: emotionalRetryRelation, latestMessageAt: now - 10 * 60 * 1000, randomValue: 0.5 }), true, "emotional retry can happen once after its delay");
assert.equal(canTriggerProactiveVoiceCall({ now, relation: emotionalRetryRelation, randomValue: 0.9 }), false, "emotional retry still has a probability gate");
assert.equal(isEmotionallyChargedCallContext("我们刚刚吵架了，我真的很难过"), true);
assert.equal(isEmotionallyChargedCallContext("不要再打给我"), false, "explicit boundary overrides emotional retry");
assert.equal(isExplicitCallBoundary("别再打了"), true);

assert.deepEqual(createProactiveCallTriggerPatch(relation, now), {
  lastProactiveCallAt: now,
  proactiveCallDayKey: getLocalDayKey(now),
  proactiveCallCount: 1,
});
assert.ok((createProactiveCallRejectionPatch(now).proactiveCallBackoffUntil || 0) > now);
assert.deepEqual(createProactiveCallRejectionPatch(now, true), {
  proactiveCallBackoffUntil: now + PROACTIVE_CALL_EMOTIONAL_RETRY_DELAY_MS,
  proactiveCallRetryAvailable: true,
});
assert.equal(resolveOutgoingCallResolution(0.01), "rejected");
assert.equal(resolveOutgoingCallResolution(0.10), "cancelled");
assert.equal(resolveOutgoingCallResolution(0.50), "connected");

console.log("Voice call outcomes and throttling: 12 checks passed");
