/**
 * ForumStory MVP domain types.
 *
 * These types intentionally model a story scope only. They do not carry
 * userIdentityId, relationId, Memory, Relationship, or other private context.
 * Storage/repository code may choose an external identity partition, but that
 * partition is not part of the story domain model.
 */

export type ForumStoryId = string;
export type StoryThreadId = string;
export type StoryCharacterId = string;
export type StoryEventId = string;
export type StoryUpdateId = string;

export type ForumStoryStatus = "draft" | "active" | "waiting_update" | "completed";

export type StoryCreationSource = "user" | "system" | "template";

export interface ForumStory {
  readonly id: ForumStoryId;
  readonly title: string;
  readonly seed: string;
  readonly premise: string;
  readonly status: ForumStoryStatus;
  readonly creationSource: StoryCreationSource;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly currentEpisode: number;
  readonly mainThreadId?: StoryThreadId;
  readonly currentStoryTime?: number;
  readonly nextUpdateAt?: number;
  readonly version: number;
}

export type StoryThreadStatus = "open" | "closed";

export interface StoryThread {
  readonly id: StoryThreadId;
  readonly storyId: ForumStoryId;
  readonly title: string;
  readonly initialContent: string;
  readonly status: StoryThreadStatus;
  /** The existing ForumThread ID, when the public Forum projection exists. */
  readonly forumThreadId?: string;
  /** Story-scoped author; never a real Character or Relationship ID. */
  readonly authorCharacterId?: StoryCharacterId;
  readonly episode: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly closedAt?: number;
}

export interface StoryCharacterIdentity {
  readonly name: string;
  readonly avatar?: string;
  /** Stable only inside this story scope; never a real character ID. */
  readonly actorKey: string;
}

export interface StoryCharacter {
  readonly id: StoryCharacterId;
  readonly storyId: ForumStoryId;
  readonly identity: StoryCharacterIdentity;
  readonly role: string;
  readonly personaSummary: string;
  /** IDs of story events this NPC may know; no private memory is represented. */
  readonly knowledgeScope: readonly StoryEventId[];
  readonly isAuthor: boolean;
  readonly status: "active" | "silent" | "removed";
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type StoryEventType =
  | "post_created"
  | "comment_added"
  | "update_published"
  | "story_progressed"
  | "story_completed";

export type StoryEventSource = "user" | "npc" | "system";
export type StoryEventStatus = "candidate" | "confirmed" | "rejected";

export interface StoryEvent {
  readonly id: StoryEventId;
  readonly storyId: ForumStoryId;
  readonly type: StoryEventType;
  readonly source: StoryEventSource;
  readonly status: StoryEventStatus;
  readonly summary: string;
  readonly sequence: number;
  /** Story version observed when this immutable event was appended. */
  readonly storyVersion: number;
  readonly occurredAt: number;
  readonly createdAt: number;
  readonly actorIds?: readonly StoryCharacterId[];
  /** Existing Forum references are optional evidence/projection links. */
  readonly forumThreadId?: string;
  readonly forumReplyId?: string;
  readonly idempotencyKey?: string;
}

/** Event input accepted by the repository; sequence is always assigned there. */
export type StoryEventInput = Omit<StoryEvent, "sequence"> & Partial<Pick<StoryEvent, "sequence">>;

export type StoryUpdateTriggerReason = "manual" | "comment_added" | "story_progressed" | "scheduled";
export type StoryUpdateStatus = "candidate" | "published" | "cancelled";

export interface StoryUpdate {
  readonly id: StoryUpdateId;
  readonly storyId: ForumStoryId;
  /** Optional public update title; it is not a private chat subject. */
  readonly title?: string;
  readonly updatedAt: number;
  readonly content: string;
  /** Public explanation of which story events this update advances. */
  readonly eventProgression?: string;
  readonly triggerReason: StoryUpdateTriggerReason;
  readonly status: StoryUpdateStatus;
  readonly eventIds: readonly StoryEventId[];
  /** Existing ForumReply ID after the update is publicly published. */
  readonly forumReplyId?: string;
  readonly createdAt: number;
}
