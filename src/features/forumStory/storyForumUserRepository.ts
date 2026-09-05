import type { StoryForumUser } from "../../domain/forumStory/forumStoryTypes";
import { storageKeys } from "../../core/storage/storageKeys";
import type { StorageResult, StorageWriteResult } from "../../core/storage/storageTypes";
import {
  failedStoryWrite,
  isStoryForumUserRecord,
  loadStoryCollection,
  saveStoryCollection,
} from "./storyStorageUtils";

export type StoryForumUserPatch = Partial<Omit<StoryForumUser, "id" | "storyId" | "createdAt">>;

export const loadStoryForumUsers = (): StorageResult<StoryForumUser[]> =>
  loadStoryCollection(storageKeys.forumStoryUsers, isStoryForumUserRecord);

export const getUsersByStoryId = (storyId: string): StoryForumUser[] =>
  loadStoryForumUsers().value.filter((user) => user.storyId === storyId);

export const getUserById = (storyId: string, userId: string): StoryForumUser | undefined =>
  getUsersByStoryId(storyId).find((user) => user.id === userId);

export const createUser = (user: StoryForumUser): StorageWriteResult => {
  if (!isStoryForumUserRecord(user)) return failedStoryWrite();
  const current = loadStoryForumUsers().value;
  if (current.some((item) => item.storyId === user.storyId && item.id === user.id)) {
    return failedStoryWrite();
  }
  return saveStoryCollection(storageKeys.forumStoryUsers, [...current, user]);
};

export const updateUser = (
  storyId: string,
  userId: string,
  patch: StoryForumUserPatch,
): StorageWriteResult => {
  const current = loadStoryForumUsers().value;
  const index = current.findIndex((user) => user.storyId === storyId && user.id === userId);
  if (index < 0) return failedStoryWrite();

  const nextUser: StoryForumUser = {
    ...current[index],
    ...patch,
    id: userId,
    storyId,
    createdAt: current[index].createdAt,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  if (!isStoryForumUserRecord(nextUser)) return failedStoryWrite();

  const next = [...current];
  next[index] = nextUser;
  return saveStoryCollection(storageKeys.forumStoryUsers, next);
};

export const StoryForumUserRepository = {
  load: loadStoryForumUsers,
  createUser,
  getUsersByStoryId,
  getUserById,
  updateUser,
};

export const storyForumUserRepository = StoryForumUserRepository;
