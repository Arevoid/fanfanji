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
  updateRelationships?: (update: (previous: CharacterRelationship[]) => CharacterRelationship[]) => void;
  onSaveCharacter: (character: Character) => void;
  /** Prefer a field patch for delayed side effects so stale full snapshots cannot overwrite settings. */
  updateCharacter?: (characterId: string, patch: Partial<Character>) => void | Promise<boolean>;
  schedule?: (task: () => void | Promise<void>, delayMs: number) => void;
  now?: () => number;
}

export type LastReadTimestamps = Record<string, number>;

const AUTO_SUMMARY_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const autoSummaryInFlight = new Set<string>();
const autoSummaryCooldownUntil = new Map<string, number>();

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
  const saveRelationships = (
    base: CharacterRelationship[],
    update: (previous: CharacterRelationship[]) => CharacterRelationship[],
  ) => {
    if (dependencies.updateRelationships) {
      dependencies.updateRelationships(update);
      return;
    }
    dependencies.onSaveRelationships(update(base));
  };

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
          const summaryScopeKey = input.activeRelationship?.id || input.activeCharacter.id;
          const currentTime = now();
          const cooldownUntil = autoSummaryCooldownUntil.get(summaryScopeKey) || 0;
          if (!autoSummaryInFlight.has(summaryScopeKey) && currentTime >= cooldownUntil) {
            // Mark this scope before scheduling. The controller can be
            // recreated by React between replies, so this guard intentionally
            // lives at module scope and prevents duplicate hidden requests.
            autoSummaryInFlight.add(summaryScopeKey);
            schedule(async () => {
              try {
                const count = await dependencies.extractMemories(eligibleMessages);
                // A successful extraction with no durable facts is still a
                // completed archive pass. Advance the marker so the same
                // range is not sent to the model again after every reply.
                if (count >= 0) {
                  autoSummaryCooldownUntil.delete(summaryScopeKey);
                  const lastMessage = eligibleMessages[eligibleMessages.length - 1];
                  if (lastMessage && input.activeRelationship) {
                    saveRelationships(input.relationships, (previous) => previous.map((relation) => relation.id === input.activeRelationship?.id
                      ? { ...relation, lastImmediateSummaryMsgId: lastMessage.id, updatedAt: now() }
                      : relation));
                  }
                } else {
                  // A failed background request must not be replayed on every
                  // following chat turn. Manual extraction is unaffected.
                  autoSummaryCooldownUntil.set(summaryScopeKey, now() + AUTO_SUMMARY_FAILURE_COOLDOWN_MS);
                }
              } catch (error) {
                autoSummaryCooldownUntil.set(summaryScopeKey, now() + AUTO_SUMMARY_FAILURE_COOLDOWN_MS);
                console.warn("Automatic memory extraction skipped after an API failure:", error instanceof Error ? error.message : error);
              } finally {
                autoSummaryInFlight.delete(summaryScopeKey);
              }
            }, 200);
          }
        }
      }

      if (input.activeCharacter.album && input.activeCharacter.album.length > 0) {
        const needsCover = !input.activeCharacter.momentsCover;
        const shouldChangeCover = needsCover || Math.random() < 0.35;
        if (shouldChangeCover) {
          const albumList = input.activeCharacter.album;
          const selectedCover = albumList[Math.floor(Math.random() * albumList.length)];
          if (selectedCover !== input.activeCharacter.momentsCover) {
            if (dependencies.updateCharacter) {
              void dependencies.updateCharacter(input.activeCharacter.id, { momentsCover: selectedCover });
            } else {
              dependencies.onSaveCharacter({
                ...input.activeCharacter,
                momentsCover: selectedCover,
              });
            }
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
