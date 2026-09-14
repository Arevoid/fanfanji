import type { Message } from "../../../types";
import type { ChatRuntimeContext } from "../../chat/context/chatRuntimeContext";
import { applyCharacterLifeStatePatch } from "../../../domain/characterLife/lifeStateRuntime";
import {
  loadCharacterLifeState,
  saveCharacterLifeState,
} from "../../../core/storage/repositories/characterLifeRepository";
import { createLifeEvent, lifeEventToCharacterEvent } from "../../../domain/characterLife/lifeEventRuntime";
import { append } from "../../../core/storage/repositories/characterEventRepository";
import { evaluateProactiveEligibility, createProactiveIntentRecord, type ProactiveEligibility } from "../../../domain/characterLife/proactiveRuntime";
import { loadProactiveIntentRecords, saveProactiveIntentRecord } from "../../../core/storage/repositories/characterLifeRepository";

/**
 * Records only the durable interaction timestamp/activity. Message content is
 * intentionally not copied into Character Life state.
 */
export const persistCharacterLifeInteraction = (
  message: Message,
  context: Pick<ChatRuntimeContext, "isGroup" | "characterId" | "relationId" | "userIdentityId">,
): void => {
  if (context.isGroup || message.sender !== "user" || !context.characterId || !context.relationId || !context.userIdentityId) return;
  const scope = {
    relationId: context.relationId,
    characterId: context.characterId,
    userIdentityId: context.userIdentityId,
  };
  const current = loadCharacterLifeState(scope, message.timestamp);
  saveCharacterLifeState(applyCharacterLifeStatePatch(current, scope, {
    currentLifePhase: "online_chat",
    currentState: "interacting",
    currentActivity: "chatting",
    availability: "available",
    lastInteractionAt: message.timestamp,
  }, message.timestamp));
};

/** Explicit event bridge; callers provide a confirmed event and no AI is used. */
export const persistConfirmedLifeEvent = (input: Parameters<typeof createLifeEvent>[0]): boolean => {
  const event = createLifeEvent(input);
  if (!event) return false;
  const result = append(lifeEventToCharacterEvent(event));
  if (!result.success) return false;
  const state = loadCharacterLifeState({
    relationId: event.relationId,
    characterId: event.characterId,
    userIdentityId: event.userIdentityId,
  }, event.timestamp);
  saveCharacterLifeState(applyCharacterLifeStatePatch(state, {
    relationId: event.relationId,
    characterId: event.characterId,
    userIdentityId: event.userIdentityId,
  }, {
    currentLifePhase: event.status === "completed" ? "event_completed" : state.currentLifePhase,
    currentActivity: event.summary,
    lastMeaningfulEventAt: event.timestamp,
  }, event.recordedAt));
  return true;
};

/** Evaluates and records at most one bounded proactive intent for a scope. */
export const evaluateAndPersistProactiveIntent = (input: Parameters<typeof evaluateProactiveEligibility>[0] & {
  id: string;
}): ProactiveEligibility => {
  const eligibility = evaluateProactiveEligibility({
    ...input,
    recentIntents: input.recentIntents || loadProactiveIntentRecords(input.scope),
  });
  if (eligibility.eligible) {
    const record = createProactiveIntentRecord({ id: input.id, scope: input.scope, intent: eligibility, now: input.now });
    if (record) saveProactiveIntentRecord(record);
  }
  return eligibility;
};
