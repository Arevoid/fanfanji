import type { MemoryItem, Message, OfflineStory } from "../../../types";
import type { ConversationSummaryRecord } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  buildOfflineHandoffTimelinePromptBlock,
  buildPendingOfflineHandoffPromptBlock,
  getOfflineMemorySourceMessages,
  hasOfflineStorySummary,
  hasOfflineStoryCanonicalSummary,
  isOfflineStoryHandoffMemory,
  selectInterveningOfflineHandoff,
} from "../../../domain/memory/offlineMemorySync";

const latestMessageBefore = (messages: readonly Message[], timestamp: number): number | undefined => [...messages]
  .filter((message) => message.timestamp < timestamp)
  .sort((left, right) => right.timestamp - left.timestamp)[0]?.timestamp;

export function buildPendingOfflineTimelineHandoff(input: {
  story: OfflineStory;
  characterName: string;
  userName: string;
  currentChatMessages: readonly Message[];
  currentOnlineAt?: number;
  summaryMemory?: MemoryItem;
}): string {
  const offlineStartedAt = input.story.onlineHandoff?.startedAt ?? input.story.createdAt;
  return buildPendingOfflineHandoffPromptBlock({
    story: input.story,
    characterName: input.characterName,
    userName: input.userName,
    previousOnlineAt: latestMessageBefore(input.currentChatMessages, offlineStartedAt),
    currentOnlineAt: input.currentOnlineAt,
    summaryMemory: input.summaryMemory,
  });
}

export function buildOfflineTimelineHandoff(input: {
  memory: MemoryItem;
  offlineStories: readonly OfflineStory[];
  relationId?: string;
  currentChatMessages: readonly Message[];
  currentOnlineAt?: number;
}): string {
  const story = input.offlineStories
    .filter((candidate) => candidate.relationId === input.relationId)
    .filter((candidate) => isOfflineStoryHandoffMemory(input.memory, candidate))
    .sort((left, right) => (right.archivedAt ?? right.updatedAt) - (left.archivedAt ?? left.updatedAt))[0];
  const sourceMessages = story ? getOfflineMemorySourceMessages(story, { includeSynced: true }) : [];
  const offlineStartedAt = sourceMessages[0]?.timestamp ?? story?.createdAt ?? input.memory.timestamp;
  return buildOfflineHandoffTimelinePromptBlock({
    memory: input.memory,
    story,
    previousOnlineAt: latestMessageBefore(input.currentChatMessages, offlineStartedAt),
    currentOnlineAt: input.currentOnlineAt,
  });
}

export function getInterveningOfflineHandoff(input: {
  currentOnlineAt?: number;
  relationId?: string;
  groupId?: string;
  currentChatMessages: readonly Message[];
  offlineStories: readonly OfflineStory[];
  memories: readonly MemoryItem[];
  summaries?: readonly ConversationSummaryRecord[];
}) {
  if (!input.currentOnlineAt || (!input.relationId && !input.groupId)) return undefined;
  const currentDate = new Date(input.currentOnlineAt);
  const currentDayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
  const previousOnlineAt = latestMessageBefore(input.currentChatMessages, currentDayStart) ?? 0;
  return selectInterveningOfflineHandoff({
    stories: input.offlineStories,
    memories: input.memories,
    summaries: input.summaries,
    relationId: input.relationId,
    groupId: input.groupId,
    after: previousOnlineAt,
    before: input.currentOnlineAt,
  });
}

export function getOfflineTimelineStoriesBetween(input: {
  previousAt: number | undefined;
  currentAt: number;
  relationId?: string;
  isGroup: boolean;
  offlineStories: readonly OfflineStory[];
  memories: readonly MemoryItem[];
  summaries?: readonly ConversationSummaryRecord[];
}): OfflineStory[] {
  if (!input.previousAt || !input.relationId || input.isGroup) return [];
  return input.offlineStories
    .filter((story) => story.relationId === input.relationId)
    .filter((story) => hasOfflineStoryCanonicalSummary(story, input.summaries || [])
      || hasOfflineStorySummary(story, input.memories))
    .filter((story) => {
      const occurredAt = story.onlineHandoff?.endedAt ?? story.archivedAt ?? story.lastMemorySyncAt ?? story.updatedAt;
      return occurredAt > input.previousAt! && occurredAt <= input.currentAt;
    })
    .sort((left, right) => {
      const leftAt = left.onlineHandoff?.endedAt ?? left.archivedAt ?? left.lastMemorySyncAt ?? left.updatedAt;
      const rightAt = right.onlineHandoff?.endedAt ?? right.archivedAt ?? right.lastMemorySyncAt ?? right.updatedAt;
      return leftAt - rightAt;
    });
}
