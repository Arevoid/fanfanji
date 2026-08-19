import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";

export const PROACTIVE_CALL_MIN_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const PROACTIVE_CALL_REJECTION_BACKOFF_MS = 12 * 60 * 60 * 1000;
export const PROACTIVE_CALL_RECENT_CHAT_SILENCE_MS = 30 * 60 * 1000;
export const PROACTIVE_CALL_MAX_PER_DAY = 2;
export const PROACTIVE_CALL_CHANCE_PER_MINUTE = 0.015;
export const PROACTIVE_CALL_EMOTIONAL_RETRY_DELAY_MS = 2 * 60 * 1000;
export const PROACTIVE_CALL_EMOTIONAL_RETRY_CHANCE = 0.65;

const EXPLICIT_CALL_BOUNDARY_PATTERN = /(别再打|不要再打|别打了|不要打了|别给我打|不要给我打|不想接你|不想接电话|拉黑|别烦我|不要联系我|别联系我)/i;
const EMOTIONAL_CONFLICT_PATTERN = /(吵架|生气|气死|吃醋|赌气|分手|讨厌你|不理你|滚|哄我|委屈|难过|伤心|哭|害怕|崩溃|失望|想你|想听你的声音|不接电话|挂电话|挂了)/i;

export function isExplicitCallBoundary(text: string): boolean {
  return EXPLICIT_CALL_BOUNDARY_PATTERN.test(text);
}

/** Detects context where a second call can be a relationship-appropriate repair attempt. */
export function isEmotionallyChargedCallContext(text: string): boolean {
  return EMOTIONAL_CONFLICT_PATTERN.test(text) && !isExplicitCallBoundary(text);
}

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
  const today = getLocalDayKey(now);
  const todayCount = relation.proactiveCallDayKey === today ? relation.proactiveCallCount || 0 : 0;
  if (todayCount >= PROACTIVE_CALL_MAX_PER_DAY) return false;
  const isEmotionalRetry = relation.proactiveCallRetryAvailable === true;
  if (isEmotionalRetry) {
    if (relation.lastProactiveCallAt && now - relation.lastProactiveCallAt < PROACTIVE_CALL_EMOTIONAL_RETRY_DELAY_MS) return false;
    if (latestMessageAt && relation.lastProactiveCallAt && latestMessageAt > relation.lastProactiveCallAt) return false;
    return randomValue < PROACTIVE_CALL_EMOTIONAL_RETRY_CHANCE;
  }
  if (relation.lastProactiveCallAt && now - relation.lastProactiveCallAt < PROACTIVE_CALL_MIN_COOLDOWN_MS) return false;
  if (latestMessageAt && now - latestMessageAt < PROACTIVE_CALL_RECENT_CHAT_SILENCE_MS) return false;

  return randomValue < PROACTIVE_CALL_CHANCE_PER_MINUTE;
}

export function createProactiveCallTriggerPatch(relation: CharacterRelationship, now: number): Partial<CharacterRelationship> {
  const today = getLocalDayKey(now);
  const todayCount = relation.proactiveCallDayKey === today ? relation.proactiveCallCount || 0 : 0;
  return {
    lastProactiveCallAt: now,
    proactiveCallDayKey: today,
    proactiveCallCount: todayCount + 1,
    ...(relation.proactiveCallRetryAvailable ? { proactiveCallRetryAvailable: undefined } : {}),
  };
}

export function createProactiveCallRejectionPatch(now: number, allowEmotionalRetry = false): Partial<CharacterRelationship> {
  return {
    proactiveCallBackoffUntil: now + (allowEmotionalRetry ? PROACTIVE_CALL_EMOTIONAL_RETRY_DELAY_MS : PROACTIVE_CALL_REJECTION_BACKOFF_MS),
    ...(allowEmotionalRetry ? { proactiveCallRetryAvailable: true } : {}),
  };
}

export type OutgoingCallResolution = "connected" | "rejected" | "cancelled";

/** A small unavailable/rejection chance prevents every simulated outgoing call from auto-answering. */
export function resolveOutgoingCallResolution(randomValue: number): OutgoingCallResolution {
  if (randomValue < 0.08) return "rejected";
  if (randomValue < 0.20) return "cancelled";
  return "connected";
}
