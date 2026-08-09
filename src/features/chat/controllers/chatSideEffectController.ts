import type { Character, Message, OfflineStory } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";

export interface ChatReplySideEffectInput {
  userMsg: Message | null;
  currentChatMessages: Message[];
  createdMessages: Message[];
  activeCharacter: Character;
  activeRelationship?: CharacterRelationship;
  relationships: CharacterRelationship[];
  isOffline: boolean;
  activeOfflineStoryId?: string | null;
  extractInterval?: number;
}

export interface ChatSideEffectControllerDependencies {
  offlineStories: OfflineStory[];
  onSaveOfflineStory?: (story: OfflineStory) => void;
  extractMemories: (messages: Message[]) => Promise<number>;
  onSaveRelationships: (relationships: CharacterRelationship[]) => void;
  onSaveCharacter: (character: Character) => void;
  schedule?: (task: () => void | Promise<void>, delayMs: number) => void;
  now?: () => number;
}

export type LastReadTimestamps = Record<string, number>;

/**
 * Reply-completion side effects. The controller deliberately receives the
 * existing Memory extraction entry point so the algorithm and persistence
 * format remain unchanged.
 */
export function createChatSideEffectController(dependencies: ChatSideEffectControllerDependencies) {
  const schedule = dependencies.schedule || ((task, delayMs) => {
    setTimeout(() => {
      void task();
    }, delayMs);
  });
  const now = dependencies.now || (() => Date.now());

  return {
    afterReplySuccess(input: ChatReplySideEffectInput): void {
      if (input.isOffline) {
        if (input.activeOfflineStoryId && dependencies.onSaveOfflineStory) {
          const targetStory = dependencies.offlineStories.find((story) => story.id === input.activeOfflineStoryId);
          if (targetStory) {
            dependencies.onSaveOfflineStory({
              ...targetStory,
              messages: [...targetStory.messages, ...input.createdMessages],
              updatedAt: now(),
            });
          }
        }
        return;
      }

      if (input.activeCharacter.enableAutoSummary === true) {
        const extractIntervalRounds = input.activeCharacter.summaryTriggerRound !== undefined
          ? input.activeCharacter.summaryTriggerRound
          : (input.extractInterval || 10);
        const triggerCount = extractIntervalRounds * 2;
        const currentMessages = input.userMsg
          ? [...input.currentChatMessages, input.userMsg, ...input.createdMessages]
          : [...input.currentChatMessages, ...input.createdMessages];

        let eligibleMessages = currentMessages;
        if (input.activeRelationship?.lastImmediateSummaryMsgId) {
          const summaryIndex = currentMessages.findIndex(
            (message) => message.id === input.activeRelationship?.lastImmediateSummaryMsgId,
          );
          if (summaryIndex !== -1) {
            eligibleMessages = currentMessages.slice(summaryIndex + 1);
          }
        }

        if (eligibleMessages.length >= triggerCount) {
          schedule(async () => {
            const count = await dependencies.extractMemories(eligibleMessages);
            // A successful extraction with no durable facts is still a
            // completed archive pass. Advance the marker so the same range is
            // not sent to the model again after every subsequent reply.
            if (count >= 0) {
              const lastMessage = eligibleMessages[eligibleMessages.length - 1];
              if (lastMessage && input.activeRelationship) {
                dependencies.onSaveRelationships(input.relationships.map((relation) => relation.id === input.activeRelationship?.id
                  ? { ...relation, lastImmediateSummaryMsgId: lastMessage.id, updatedAt: now() }
                  : relation));
              }
            }
          }, 200);
        }
      }

      if (input.activeCharacter.album && input.activeCharacter.album.length > 0) {
        const needsCover = !input.activeCharacter.momentsCover;
        const shouldChangeCover = needsCover || Math.random() < 0.35;
        if (shouldChangeCover) {
          const albumList = input.activeCharacter.album;
          const selectedCover = albumList[Math.floor(Math.random() * albumList.length)];
          if (selectedCover !== input.activeCharacter.momentsCover) {
            dependencies.onSaveCharacter({
              ...input.activeCharacter,
              momentsCover: selectedCover,
            });
          }
        }
      }
    },
  };
}

export function markChatInitiated(previous: string[], chatKey: string): string[] {
  return previous.includes(chatKey) ? previous : [...previous, chatKey];
}

export function markChatRead(
  previous: LastReadTimestamps,
  chatKey: string,
  timestamp: number,
): LastReadTimestamps {
  return { ...previous, [chatKey]: timestamp };
}

export function touchRelationshipSession(
  relationships: CharacterRelationship[],
  relationId: string,
  timestamp: number,
): CharacterRelationship[] {
  return relationships.map((relation) => relation.id === relationId
    ? { ...relation, lastActiveTime: timestamp, updatedAt: timestamp }
    : relation);
}
