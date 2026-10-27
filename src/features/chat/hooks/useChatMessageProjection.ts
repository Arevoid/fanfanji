import { useMemo } from "react";
import type { Character, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { isVisibleChatMessage } from "../services/chatDisplayProjection";
import { selectChatTimeline } from "../../../domain/chat/chatTimelineIndex";

interface UseChatMessageProjectionOptions {
  messages: Message[];
  activeChatCharId: string | null;
  activeRelationship?: CharacterRelationship;
  activeCharacter?: Character;
}
const visibleSnapshots = new WeakMap<Message[], Message[]>();
function visibleSnapshot(messages: Message[]): Message[] {
  const cached = visibleSnapshots.get(messages); if (cached) return cached;
  const result = messages.filter(isVisibleChatMessage); visibleSnapshots.set(messages, result); return result;
}

/** Derives the active conversation timeline without owning chat mutations. */
export function useChatMessageProjection({
  messages,
  activeChatCharId,
  activeRelationship,
  activeCharacter,
}: UseChatMessageProjectionOptions): {
  currentChatMessages: Message[];
  visibleChatMessages: Message[];
} {
  const currentChatMessages = useMemo<Message[]>(
    () => selectChatTimeline(messages, { characterId: activeChatCharId || "", relationId: activeRelationship?.id,
      conversationId: activeRelationship?.conversationId, group: activeCharacter?.isGroupChat }),
    [activeCharacter?.isGroupChat, activeChatCharId, activeRelationship?.id, activeRelationship?.conversationId, messages],
  );
  const visibleChatMessages = useMemo<Message[]>(
    // Keep original immutable records; expensive display parsing happens only
    // for mounted rows. Empty/marker-only rows remain excluded from the UI.
    () => visibleSnapshot(currentChatMessages),
    [currentChatMessages],
  );

  return { currentChatMessages, visibleChatMessages };
}
