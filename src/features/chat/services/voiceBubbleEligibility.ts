import type { Character, Message } from "../../../types";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";
import { shouldAutomaticallyConvertTextToVoice } from "./voiceMessageEligibility";

export interface VoiceBubbleEligibilityInput {
  enabled: boolean;
  character: Character;
  lastUserMessage: Message | null;
  recentMessages: readonly Message[];
  bubbleIndex: number;
  bubbleText: string;
  replyContext: ChatRuntimeContext;
}

/** Adapts page-level reply state to the pure automatic voice policy. */
export function shouldConvertBubbleToVoice(input: VoiceBubbleEligibilityInput): boolean {
  const { enabled, character, lastUserMessage, recentMessages, bubbleIndex, bubbleText, replyContext } = input;
  if (!enabled) return false;
  if (!replyContext.characterId || !replyContext.relationId || !replyContext.conversationId || replyContext.isGroup) return false;
  return shouldAutomaticallyConvertTextToVoice({
    character,
    lastUserMessage,
    recentMessages,
    bubbleIndex,
    bubbleText,
    scope: {
      characterId: replyContext.characterId,
      relationId: replyContext.relationId,
      conversationId: replyContext.conversationId,
      userIdentityId: replyContext.userIdentityId,
    },
  });
}
