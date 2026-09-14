import type { CharacterLifeScope } from "./characterLifeTypes";
import type { CharacterLifeState } from "./lifeStateRuntime";
import type { CharacterScheduleEntry } from "./scheduleRuntime";
import type { OpenLoopRecord } from "../continuity/openLoopRuntime";
import type { CharacterEvent } from "./characterEventTypes";

export const PROACTIVE_RUNTIME_SCHEMA_VERSION = 1 as const;
export const PROACTIVE_DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const PROACTIVE_DEFAULT_QUIET_PERIOD_MS = 30 * 60 * 1000;

export type ProactiveIntentType =
  | "find_user"
  | "remind_promise"
  | "follow_up_topic"
  | "share_event"
  | "resolve_conflict";
export type ProactiveIntentStatus = "planned" | "sent" | "dismissed" | "suppressed";

export interface ProactiveIntentRecord extends CharacterLifeScope {
  schemaVersion: typeof PROACTIVE_RUNTIME_SCHEMA_VERSION;
  id: string;
  type: ProactiveIntentType;
  status: ProactiveIntentStatus;
  reason: string;
  sourceRefs: readonly string[];
  createdAt: number;
  cooldownUntil: number;
}

export type ProactiveBlockReason =
  | "disabled"
  | "quiet_period"
  | "cooldown"
  | "duplicate_intent"
  | "no_meaningful_signal"
  | "no_eligible_intent";

export type ProactiveEligibility =
  | { eligible: true; intent: ProactiveIntentType; reason: string; sourceRefs: string[]; cooldownUntil: number }
  | { eligible: false; reason: ProactiveBlockReason; cooldownUntil?: number };

const INTENTS = new Set<ProactiveIntentType>(["find_user", "remind_promise", "follow_up_topic", "share_event", "resolve_conflict"]);
const STATUSES = new Set<ProactiveIntentStatus>(["planned", "sent", "dismissed", "suppressed"]);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const refs = (value: unknown): string[] => Array.from(new Set(
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [],
)).slice(0, 24);
const sameScope = (left: CharacterLifeScope, right: CharacterLifeScope): boolean =>
  left.relationId === right.relationId && left.characterId === right.characterId && left.userIdentityId === right.userIdentityId;

export const normalizeProactiveIntent = (value: unknown): ProactiveIntentRecord | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ProactiveIntentRecord>;
  if (candidate.schemaVersion !== PROACTIVE_RUNTIME_SCHEMA_VERSION
    || typeof candidate.id !== "string" || !candidate.id.trim()
    || typeof candidate.relationId !== "string" || !candidate.relationId.trim()
    || typeof candidate.characterId !== "string" || !candidate.characterId.trim()
    || typeof candidate.userIdentityId !== "string" || !candidate.userIdentityId.trim()
    || !INTENTS.has(candidate.type as ProactiveIntentType)
    || !STATUSES.has(candidate.status as ProactiveIntentStatus)
    || typeof candidate.reason !== "string" || !candidate.reason.trim()
    || !finite(candidate.createdAt) || !finite(candidate.cooldownUntil)) return undefined;
  return {
    schemaVersion: PROACTIVE_RUNTIME_SCHEMA_VERSION,
    id: candidate.id.trim(),
    relationId: candidate.relationId.trim(),
    characterId: candidate.characterId.trim(),
    userIdentityId: candidate.userIdentityId.trim(),
    type: candidate.type as ProactiveIntentType,
    status: candidate.status as ProactiveIntentStatus,
    reason: candidate.reason.trim().slice(0, 240),
    sourceRefs: refs(candidate.sourceRefs),
    createdAt: candidate.createdAt,
    cooldownUntil: candidate.cooldownUntil,
  };
};

export const isProactiveIntentRecord = (value: unknown): value is ProactiveIntentRecord =>
  normalizeProactiveIntent(value) !== undefined;

const block = (reason: ProactiveBlockReason, cooldownUntil?: number): ProactiveEligibility => ({
  eligible: false,
  reason,
  ...(cooldownUntil === undefined ? {} : { cooldownUntil }),
});

/**
 * Deterministic eligibility only. It chooses one meaningful signal and never
 * invokes an AI model; generation, when actually requested, remains one action.
 */
export const evaluateProactiveEligibility = (input: {
  enabled: boolean;
  scope: CharacterLifeScope;
  now: number;
  lifeState?: CharacterLifeState;
  openLoops?: readonly OpenLoopRecord[];
  schedules?: readonly CharacterScheduleEntry[];
  events?: readonly CharacterEvent[];
  unresolvedTopic?: boolean;
  emotionResidue?: number;
  recentIntents?: readonly ProactiveIntentRecord[];
  cooldownMs?: number;
  quietPeriodMs?: number;
}): ProactiveEligibility => {
  if (!input.enabled) return block("disabled");
  const now = finite(input.now) ? input.now : Date.now();
  const quietPeriodMs = input.quietPeriodMs ?? PROACTIVE_DEFAULT_QUIET_PERIOD_MS;
  const lastInteractionAt = input.lifeState?.lastInteractionAt;
  if (lastInteractionAt !== undefined && now - lastInteractionAt < quietPeriodMs) return block("quiet_period");
  const scopedIntents = (input.recentIntents || []).filter((intent) => sameScope(intent, input.scope));
  const activeCooldown = scopedIntents
    .filter((intent) => intent.status === "planned" || intent.status === "sent")
    .sort((left, right) => right.cooldownUntil - left.cooldownUntil)[0];
  if (activeCooldown && activeCooldown.cooldownUntil > now) return block("cooldown", activeCooldown.cooldownUntil);
  const sourceRefs: string[] = [];
  const scopedLoops = (input.openLoops || []).filter((loop) => sameScope(loop.scope, input.scope)
    && (loop.status === "open" || loop.status === "pending"));
  const scopedSchedules = (input.schedules || []).filter((entry) => sameScope(entry, input.scope)
    && entry.status === "scheduled");
  const scopedEvents = (input.events || []).filter((event) => sameScope(event, input.scope));
  let intent: ProactiveIntentType | undefined;
  let reason = "";
  if (scopedLoops.some((loop) => loop.type === "promise")) {
    intent = "remind_promise";
    reason = "pending_promise";
    sourceRefs.push(scopedLoops.find((loop) => loop.type === "promise")!.id);
  } else if (input.unresolvedTopic) {
    intent = "follow_up_topic";
    reason = "unresolved_topic";
  } else if (scopedEvents.length > 0) {
    intent = "share_event";
    reason = "recent_meaningful_event";
    sourceRefs.push(scopedEvents[scopedEvents.length - 1].id);
  } else if (scopedSchedules.some((entry) => entry.startAt !== undefined && entry.startAt <= now)) {
    intent = "remind_promise";
    reason = "schedule_due";
    sourceRefs.push(scopedSchedules.find((entry) => entry.startAt !== undefined && entry.startAt <= now)!.id);
  } else if (typeof input.emotionResidue === "number" && input.emotionResidue >= 0.65) {
    intent = "find_user";
    reason = "emotion_residue";
  }
  if (!intent) return block("no_meaningful_signal");
  const duplicate = scopedIntents.some((record) => record.type === intent
    && (record.status === "planned" || record.status === "sent")
    && now - record.createdAt < (input.cooldownMs ?? PROACTIVE_DEFAULT_COOLDOWN_MS));
  if (duplicate) return block("duplicate_intent");
  const cooldownUntil = now + (input.cooldownMs ?? PROACTIVE_DEFAULT_COOLDOWN_MS);
  return { eligible: true, intent, reason, sourceRefs: refs(sourceRefs), cooldownUntil };
};

export const createProactiveIntentRecord = (input: {
  id: string;
  scope: CharacterLifeScope;
  intent: ProactiveEligibility & { eligible: true };
  now: number;
}): ProactiveIntentRecord | undefined => {
  if (!input.id.trim() || !finite(input.now)) return undefined;
  return {
    schemaVersion: PROACTIVE_RUNTIME_SCHEMA_VERSION,
    id: input.id.trim(),
    ...input.scope,
    type: input.intent.intent,
    status: "planned",
    reason: input.intent.reason,
    sourceRefs: refs(input.intent.sourceRefs),
    createdAt: input.now,
    cooldownUntil: input.intent.cooldownUntil,
  };
};

export const transitionProactiveIntent = (
  record: ProactiveIntentRecord,
  status: ProactiveIntentStatus,
): ProactiveIntentRecord => ({ ...record, status });
