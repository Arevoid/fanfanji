import type { Message } from "../../../types";
import { createVoiceCallRecordMessage, isCurrentVoiceCallScope, type DirectVoiceCallScope } from "./voiceCallScope";

/** Builds a user subtitle sent from the currently active direct voice call. */
export function createVoiceCallUserMessage(input: {
  text: string;
  characterId?: string;
  sessionRelationId: string | null;
  scope?: DirectVoiceCallScope;
  id: string;
  timestamp: number;
}): Message | undefined {
  const content = input.text.trim();
  if (!content || !input.characterId || !isCurrentVoiceCallScope(input.sessionRelationId, input.scope)) return undefined;
  return createVoiceCallRecordMessage({
    id: input.id,
    characterId: input.characterId,
    scope: input.scope,
    content,
    timestamp: input.timestamp,
    sender: "user",
  });
}
