import { createId } from "../../core/id/createId";
import type { SmsAnchorChoice, SmsTimeline, SmsTimelineKind } from "../../domain/sms/smsTypes";

export function createUnanchoredSmsTimeline(input: { ownerIdentityId: string; phoneNumber: string; characterId: string }): SmsTimeline {
  const now = Date.now();
  return {
    id: createId("sms-explore"),
    characterId: input.characterId,
    ownerIdentityId: input.ownerIdentityId,
    phoneNumber: input.phoneNumber,
    label: "未锚定探索",
    kind: "custom",
    mode: "unanchored",
    knowsCurrentTimeline: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createAnchoredSmsTimeline(input: {
  ownerIdentityId: string;
  phoneNumber: string;
  characterId: string;
  label: string;
  kind: SmsTimelineKind;
  timelineTime?: string;
  relationshipHint?: string;
  knowsCurrentTimeline: boolean;
}): SmsTimeline {
  const now = Date.now();
  return {
    id: createId("sms-line"),
    characterId: input.characterId,
    ownerIdentityId: input.ownerIdentityId,
    phoneNumber: input.phoneNumber,
    label: input.label.trim() || "短信时间线",
    kind: input.kind,
    mode: "anchored",
    timelineTime: input.timelineTime?.trim() || undefined,
    relationshipHint: input.relationshipHint?.trim() || undefined,
    knowsCurrentTimeline: input.knowsCurrentTimeline,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveAnchorChoice(input: {
  choice: SmsAnchorChoice;
  current: SmsTimeline;
  next: SmsTimeline;
}): { timelineId: string; preserveExploration: boolean } {
  return input.choice === "convert_current"
    ? { timelineId: input.next.id, preserveExploration: false }
    : { timelineId: input.next.id, preserveExploration: true };
}
