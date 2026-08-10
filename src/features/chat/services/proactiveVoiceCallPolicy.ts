import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";

export const PROACTIVE_CALL_MIN_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const PROACTIVE_CALL_REJECTION_BACKOFF_MS = 12 * 60 * 60 * 1000;
export const PROACTIVE_CALL_RECENT_CHAT_SILENCE_MS = 30 * 60 * 1000;
export const PROACTIVE_CALL_MAX_PER_DAY = 2;
export const PROACTIVE_CALL_CHANCE_PER_MINUTE = 0.015;

export function getLocalDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isTimeWithinRange(timestamp: number, startTime = "09:00", endTime = "22:00"): boolean {
  const date = new Date(timestamp);
  const current = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (startTime === endTime) return true;
  if (startTime < endTime) return current >= startTime && current <= endTime;
  return current >= startTime || current <= endTime;
}

export function canTriggerProactiveVoiceCall(input: {
  now: number;
  relation: CharacterRelationship;
  latestMessageAt?: number;
  startTime?: string;
  endTime?: string;
  randomValue: number;
}): boolean {
  const { now, relation, latestMessageAt, startTime, endTime, randomValue } = input;
  if (!isTimeWithinRange(now, startTime, endTime)) return false;
  if (relation.proactiveCallBackoffUntil && now < relation.proactiveCallBackoffUntil) return false;
  if (relation.lastProactiveCallAt && now - relation.lastProactiveCallAt < PROACTIVE_CALL_MIN_COOLDOWN_MS) return false;
  if (latestMessageAt && now - latestMessageAt < PROACTIVE_CALL_RECENT_CHAT_SILENCE_MS) return false;

  const today = getLocalDayKey(now);
  const todayCount = relation.proactiveCallDayKey === today ? relation.proactiveCallCount || 0 : 0;
  if (todayCount >= PROACTIVE_CALL_MAX_PER_DAY) return false;
  return randomValue < PROACTIVE_CALL_CHANCE_PER_MINUTE;
}

export function createProactiveCallTriggerPatch(relation: CharacterRelationship, now: number): Partial<CharacterRelationship> {
  const today = getLocalDayKey(now);
  const todayCount = relation.proactiveCallDayKey === today ? relation.proactiveCallCount || 0 : 0;
  return {
    lastProactiveCallAt: now,
    proactiveCallDayKey: today,
    proactiveCallCount: todayCount + 1,
  };
}

export function createProactiveCallRejectionPatch(now: number): Partial<CharacterRelationship> {
  return { proactiveCallBackoffUntil: now + PROACTIVE_CALL_REJECTION_BACKOFF_MS };
}

export type OutgoingCallResolution = "connected" | "rejected" | "cancelled";

/** A small unavailable/rejection chance prevents every simulated outgoing call from auto-answering. */
export function resolveOutgoingCallResolution(randomValue: number): OutgoingCallResolution {
  if (randomValue < 0.08) return "rejected";
  if (randomValue < 0.20) return "cancelled";
  return "connected";
}
