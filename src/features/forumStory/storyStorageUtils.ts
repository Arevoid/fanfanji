import type {
  ForumStory,
  ForumStoryExecutionLog,
  StoryCharacter,
  StoryEvent,
  StoryForumUser,
  StoryThread,
  StoryUpdate,
} from "../../domain/forumStory/forumStoryTypes";
import { readArray, writeArray } from "../../core/storage/repositories/repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../../core/storage/storageTypes";

const FORBIDDEN_SCOPE_KEYS = new Set([
  "relationId",
  "userIdentityId",
  "memory",
  "Memory",
  "relationship",
  "Relationship",
  "privateContext",
  "PrivateContext",
  "privateActor",
  "PrivateActor",
  "conversationId",
  "ConversationId",
  "userId",
  "UserId",
  "realUserId",
  "RealUserId",
  "characterId",
  "CharacterId",
  "realCharacterId",
  "RealCharacterId",
  "relationshipId",
  "RelationshipId",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Reject private/relationship scope fields at every nesting level before persistence. */
export const containsForbiddenStoryScopeKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsForbiddenStoryScopeKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => FORBIDDEN_SCOPE_KEYS.has(key) || containsForbiddenStoryScopeKey(nested));
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNonNegativeNumber = (value: unknown): value is number => isFiniteNumber(value) && value >= 0;
const isNonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isPositiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

export const isForumStoryRecord = (value: unknown): value is ForumStory => {
  if (!isRecord(value) || containsForbiddenStoryScopeKey(value)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.seed === "string"
    && typeof value.premise === "string"
    && ["draft", "active", "waiting_update", "completed"].includes(String(value.status))
    && ["user", "system", "template"].includes(String(value.creationSource))
    && (value.narrativeOutcome === undefined || ["complete", "abandoned", "open"].includes(String(value.narrativeOutcome)))
    && isFiniteNumber(value.createdAt)
    && isFiniteNumber(value.updatedAt)
    && (value.startedAt === undefined || isFiniteNumber(value.startedAt))
    && (value.completedAt === undefined || isFiniteNumber(value.completedAt))
    && isPositiveInteger(value.currentEpisode)
    && (value.mainThreadId === undefined || typeof value.mainThreadId === "string")
    && (value.currentStoryTime === undefined || isFiniteNumber(value.currentStoryTime))
    && (value.nextUpdateAt === undefined || isFiniteNumber(value.nextUpdateAt))
    && isPositiveInteger(value.version);
};

export const isStoryThreadRecord = (value: unknown): value is StoryThread => {
  if (!isRecord(value) || containsForbiddenStoryScopeKey(value)) return false;
  return typeof value.id === "string"
    && typeof value.storyId === "string"
    && typeof value.title === "string"
    && typeof value.initialContent === "string"
    && ["open", "closed"].includes(String(value.status))
    && (value.forumThreadId === undefined || typeof value.forumThreadId === "string")
    && (value.authorCharacterId === undefined || typeof value.authorCharacterId === "string")
    && isPositiveInteger(value.episode)
    && isFiniteNumber(value.createdAt)
    && isFiniteNumber(value.updatedAt)
    && (value.viewCount === undefined || isNonNegativeInteger(value.viewCount))
    && (value.likeCount === undefined || isNonNegativeInteger(value.likeCount))
    && (value.likedByIdentityIds === undefined || isStringArray(value.likedByIdentityIds))
    && (value.readerInterest === undefined || typeof value.readerInterest === "boolean")
    && (value.closedAt === undefined || isFiniteNumber(value.closedAt));
};

export const isStoryCharacterRecord = (value: unknown): value is StoryCharacter => {
  if (!isRecord(value) || containsForbiddenStoryScopeKey(value)) return false;
  const identity = value.identity;
  return typeof value.id === "string"
    && typeof value.storyId === "string"
    && isRecord(identity)
    && typeof identity.name === "string"
    && (identity.avatar === undefined || typeof identity.avatar === "string")
    && typeof identity.actorKey === "string"
    && typeof value.role === "string"
    && typeof value.personaSummary === "string"
    && isStringArray(value.knowledgeScope)
    && typeof value.isAuthor === "boolean"
    && ["active", "silent", "removed"].includes(String(value.status))
    && isFiniteNumber(value.createdAt)
    && isFiniteNumber(value.updatedAt);
};

export const isStoryForumUserRecord = (value: unknown): value is StoryForumUser => {
  if (!isRecord(value) || containsForbiddenStoryScopeKey(value)) return false;
  return typeof value.id === "string"
    && typeof value.storyId === "string"
    && typeof value.displayName === "string"
    && value.displayName.trim().length > 0
    && ["anonymous", "observer", "insider", "analyst", "supporter", "skeptic"].includes(String(value.userType))
    && typeof value.style === "string"
    && value.style.trim().length > 0
    && typeof value.personaSummary === "string"
    && value.personaSummary.trim().length > 0
    && isFiniteNumber(value.createdAt)
    && (value.updatedAt === undefined || isFiniteNumber(value.updatedAt));
};

export const isStoryEventRecord = (value: unknown): value is StoryEvent => {
  if (!isRecord(value) || containsForbiddenStoryScopeKey(value)) return false;
  return typeof value.id === "string"
    && typeof value.storyId === "string"
    && ["post_created", "comment_added", "update_published", "story_progressed", "story_completed"].includes(String(value.type))
    && ["user", "npc", "system"].includes(String(value.source))
    && ["candidate", "confirmed", "rejected"].includes(String(value.status))
    && typeof value.summary === "string"
    && isPositiveInteger(value.sequence)
    && isPositiveInteger(value.storyVersion)
    && isFiniteNumber(value.occurredAt)
    && isFiniteNumber(value.createdAt)
    && (value.actorIds === undefined || isStringArray(value.actorIds))
    && (value.forumThreadId === undefined || typeof value.forumThreadId === "string")
    && (value.forumReplyId === undefined || typeof value.forumReplyId === "string")
    && (value.floorNumber === undefined || isPositiveInteger(value.floorNumber))
    && (value.idempotencyKey === undefined || typeof value.idempotencyKey === "string");
};

export const isStoryUpdateRecord = (value: unknown): value is StoryUpdate => {
  if (!isRecord(value) || containsForbiddenStoryScopeKey(value)) return false;
  return typeof value.id === "string"
    && typeof value.storyId === "string"
    && (value.title === undefined || typeof value.title === "string")
    && isFiniteNumber(value.updatedAt)
    && typeof value.content === "string"
    && (value.eventProgression === undefined || typeof value.eventProgression === "string")
    && ["manual", "comment_added", "story_progressed", "scheduled"].includes(String(value.triggerReason))
    && ["candidate", "published", "cancelled"].includes(String(value.status))
    && isStringArray(value.eventIds)
    && (value.forumReplyId === undefined || typeof value.forumReplyId === "string")
    && isFiniteNumber(value.createdAt);
};

export const isForumStoryExecutionLogRecord = (value: unknown): value is ForumStoryExecutionLog => {
  if (!isRecord(value) || containsForbiddenStoryScopeKey(value)) return false;
  return typeof value.id === "string"
    && typeof value.storyId === "string"
    && ["generate_update", "generate_comment_reaction", "none"].includes(String(value.action))
    && ["time", "comment_activity", "hot_discussion", "manual"].includes(String(value.trigger))
    && ["pending", "running", "success", "failed"].includes(String(value.status))
    && isFiniteNumber(value.startedAt)
    && (value.finishedAt === undefined || isFiniteNumber(value.finishedAt))
    && (value.error === undefined || typeof value.error === "string");
};

export const loadStoryCollection = <T>(
  key: string,
  predicate: (value: unknown) => value is T,
): StorageResult<T[]> => {
  const loaded = readArray<unknown>(key, []);
  return { ...loaded, value: loaded.value.filter(predicate) };
};

export const saveStoryCollection = <T>(key: string, values: readonly T[]): StorageWriteResult =>
  writeArray(key, [...values]);

export const failedStoryWrite = (): StorageWriteResult => ({ success: false, error: "write" });
