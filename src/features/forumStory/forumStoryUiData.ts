import type {
  ForumStory,
  StoryCharacterId,
  StoryEvent,
  StoryThread,
} from "../../domain/forumStory/forumStoryTypes";
import { ForumStoryRepository } from "./forumStoryRepository";
import { StoryEventRepository } from "./storyEventRepository";
import { StoryCharacterRepository } from "./storyCharacterRepository";
import { StoryForumReplyRepository, type StoryForumReply } from "./storyReplyRepository";
import { StoryThreadRepository } from "./storyThreadRepository";
import { StoryUpdateRepository } from "./storyUpdateRepository";

export interface ForumStoryUiListItem {
  storyId: string;
  threadId: string;
  title: string;
  body: string;
  authorName: string;
  authorAvatar?: string;
  updatedAt: number;
  likeCount: number;
  replyCount: number;
}

export interface ForumStoryUiCharacter {
  id: StoryCharacterId;
  name: string;
  role: string;
}

export interface ForumStoryUiReply {
  id: string;
  floor: number;
  authorName: string;
  body: string;
  occurredAt: number;
  storyCharacterId?: StoryCharacterId;
}

export interface ForumStoryUiUpdate {
  id: string;
  title?: string;
  content: string;
  eventProgression?: string;
  updatedAt: number;
}

export interface ForumStoryUiThread {
  story: ForumStory;
  thread: StoryThread;
  characters: readonly ForumStoryUiCharacter[];
  replies: readonly ForumStoryUiReply[];
  updates: readonly ForumStoryUiUpdate[];
}

const selectMainThread = (story: ForumStory): StoryThread | undefined => {
  const threads = StoryThreadRepository.listThreads(story.id);
  return threads.find((thread) => thread.id === story.mainThreadId) || threads[0];
};

/** Read-only list projection. It reads only ForumStory/StoryThread repositories. */
export const listForumStoryUiItems = (): ForumStoryUiListItem[] =>
  ForumStoryRepository.listStories()
    .map((story) => {
      const thread = selectMainThread(story);
      if (!thread) return undefined;
      const author = thread.authorCharacterId
        ? StoryCharacterRepository.getStoryCharactersByStoryId(story.id).find((character) => character.id === thread.authorCharacterId)
        : undefined;
      return {
        storyId: story.id,
        threadId: thread.id,
        title: story.title || thread.title,
        body: thread.initialContent,
        authorName: author?.identity.name || "匿名楼主",
        ...(author?.identity.avatar ? { authorAvatar: author.identity.avatar } : {}),
        updatedAt: Math.max(story.updatedAt, thread.updatedAt),
        likeCount: thread.likeCount || 0,
        replyCount: StoryForumReplyRepository.listReplies(story.id, thread.id).length,
      };
    })
    .filter((item): item is ForumStoryUiListItem => Boolean(item))
    .sort((left, right) => right.updatedAt - left.updatedAt);

const findEventForReply = (events: readonly StoryEvent[], replyId: string): StoryEvent | undefined =>
  events.find((event) => event.forumReplyId === replyId);

const buildCharacters = (input: {
  storyId: string;
  thread: StoryThread;
  events: readonly StoryEvent[];
  replies: readonly StoryForumReply[];
}): ForumStoryUiCharacter[] => {
  const characters = new Map<string, ForumStoryUiCharacter>();
  const authorId = input.thread.authorCharacterId;
  if (authorId) {
    const author = StoryCharacterRepository.getStoryCharactersByStoryId(input.storyId)
      .find((character) => character.id === authorId);
    characters.set(authorId, { id: authorId, name: author?.identity.name || "匿名楼主", role: "楼主" });
  }
  for (const reply of input.replies) {
    const actorId = findEventForReply(input.events, reply.id)?.actorIds?.[0];
    if (!actorId) continue;
    characters.set(actorId, {
      id: actorId,
      name: reply.publicAuthor.displayName,
      role: reply.storyCommentLabel || "故事角色",
    });
  }
  for (const event of input.events) {
    for (const actorId of event.actorIds || []) {
      if (!characters.has(actorId)) characters.set(actorId, { id: actorId, name: `故事角色 ${actorId}`, role: "故事角色" });
    }
  }
  return [...characters.values()];
};

/**
 * Builds the story thread read model. Every collection is filtered by the
 * requested story id before it can reach the UI; ordinary Forum data is not
 * consulted here.
 */
export const getForumStoryUiThread = (storyId: string): ForumStoryUiThread | undefined => {
  const story = ForumStoryRepository.getStory(storyId);
  if (!story) return undefined;
  const thread = selectMainThread(story);
  if (!thread) return undefined;
  const events = StoryEventRepository.listEvents(story.id).filter((event) => event.status === "confirmed");
  const replies = StoryForumReplyRepository.listReplies(story.id, thread.id);
  const updates = StoryUpdateRepository.listUpdates(story.id)
    .filter((update) => update.status === "published")
    .sort((left, right) => left.updatedAt - right.updatedAt)
    .map((update) => ({
      id: update.id,
      ...(update.title ? { title: update.title } : {}),
      content: update.content,
      ...(update.eventProgression ? { eventProgression: update.eventProgression } : {}),
      updatedAt: update.updatedAt,
    }));
  return {
    story,
    thread,
    characters: buildCharacters({ storyId: story.id, thread, events, replies }),
    replies: replies.map((reply) => ({
      id: reply.id,
      floor: reply.floor,
      authorName: reply.publicAuthor.displayName,
      body: reply.body,
      occurredAt: reply.occurredAt,
      ...(findEventForReply(events, reply.id)?.actorIds?.[0]
        ? { storyCharacterId: findEventForReply(events, reply.id)?.actorIds?.[0] }
        : {}),
    })),
    updates,
  };
};
