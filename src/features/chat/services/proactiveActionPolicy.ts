import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { canAcceptContextualProactiveCall } from "./proactiveVoiceCallPolicy";
import type { ProactiveActionDirective } from "./proactiveActionProtocol";

export type ProactiveActionBlockReason =
  | "unsupported_scope"
  | "call_disabled"
  | "no_context_cue"
  | "call_throttled";

export type ProactiveActionDecision =
  | { allowed: true }
  | { allowed: false; reason: ProactiveActionBlockReason };

// These cues are intentionally about an actual call/meeting channel, not
// generic affection. A model cannot turn a routine “想你” message into an
// unexpected incoming call without first seeing a concrete communication cue.
const CALL_CONTEXT_CUE = /(?:电话|来电|打给|打电话|通话|语音|听(?:听)?(?:你)?的声音|视频|视频见|开视频|voice call|call me|video call|talk on the phone|전화|통화|ビデオ|電話)/iu;

export function hasProactiveCallContextCue(messages: readonly Message[], reason = ""): boolean {
  const recentText = messages
    .filter((message) => !message.isOffline)
    .slice(-8)
    .map((message) => message.content || "")
    .join("\n");
  return CALL_CONTEXT_CUE.test(recentText) || CALL_CONTEXT_CUE.test(reason);
}

export function evaluateProactiveAction(input: {
  action: ProactiveActionDirective;
  character: Character;
  relationship: CharacterRelationship;
  messages: readonly Message[];
  now: number;
}): ProactiveActionDecision {
  if (input.character.isGroupChat || !input.relationship.id || !input.relationship.characterId) {
    return { allowed: false, reason: "unsupported_scope" };
  }
  if (!input.character.enableProactiveCall) return { allowed: false, reason: "call_disabled" };
  if (!hasProactiveCallContextCue(input.messages, input.action.reason)) {
    return { allowed: false, reason: "no_context_cue" };
  }
  if (!canAcceptContextualProactiveCall({
    now: input.now,
    relation: input.relationship,
    latestMessageAt: input.messages
      .filter((message) => !message.isOffline)
      .reduce((latest, message) => Math.max(latest, message.timestamp), 0) || undefined,
    startTime: input.character.proactiveStartTime,
    endTime: input.character.proactiveEndTime,
  })) {
    return { allowed: false, reason: "call_throttled" };
  }
  return { allowed: true };
}
