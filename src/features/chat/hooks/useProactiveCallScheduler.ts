import { useBackgroundScheduler } from "../../../core/scheduler/useBackgroundScheduler";
import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { DirectVoiceCallScope } from "../services/voiceCallScope";
import { canTriggerProactiveVoiceCall, createProactiveCallTriggerPatch } from "../services/proactiveVoiceCallPolicy";

interface UseProactiveCallSchedulerOptions {
  character?: Character;
  relationship?: CharacterRelationship;
  voiceCallScope?: DirectVoiceCallScope;
  activeAttachModal: string | null;
  messagesRef: { current: Message[] };
  isOfflineStoryActiveFor: (relationId: string) => boolean;
  updateRelationshipSession: (relationId: string, patch: Partial<CharacterRelationship>) => void;
  beginVoiceCall: (incoming: boolean) => void;
}

/** Keeps proactive-call timing separate from the chat view's render lifecycle. */
export function useProactiveCallScheduler({
  character,
  relationship,
  voiceCallScope,
  activeAttachModal,
  messagesRef,
  isOfflineStoryActiveFor,
  updateRelationshipSession,
  beginVoiceCall,
}: UseProactiveCallSchedulerOptions): void {
  const run = async () => {
    if (!character || !relationship || !voiceCallScope || character.isGroupChat || !character.enableProactiveCall) return;
    if (activeAttachModal || isOfflineStoryActiveFor(voiceCallScope.relationId)) return;
    const now = Date.now();
    const latestMessageAt = messagesRef.current
      .filter((message) => message.relationId === voiceCallScope.relationId && !message.isOffline)
      .reduce((latest, message) => Math.max(latest, message.timestamp), 0) || undefined;
    if (!canTriggerProactiveVoiceCall({
      now,
      relation: relationship,
      latestMessageAt,
      startTime: character.proactiveStartTime,
      endTime: character.proactiveEndTime,
      randomValue: Math.random(),
    })) return;
    updateRelationshipSession(voiceCallScope.relationId, createProactiveCallTriggerPatch(relationship, now));
    beginVoiceCall(true);
  };

  useBackgroundScheduler({
    id: "chat-proactive-call",
    enabled: Boolean(character && relationship && voiceCallScope && !character.isGroupChat && character.enableProactiveCall),
    intervalMs: 60 * 1000,
    initialDelayMs: 60 * 1000,
    run,
  });
}
