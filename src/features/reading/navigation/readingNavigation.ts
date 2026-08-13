import type { ReadingRoom } from "../../../domain/reading/coReadingTypes";
import type { ReadingCoStoryState } from "../../../domain/reading/coStoryTypes";
import type { ReadingStoryState } from "../../../domain/reading/storyTypes";
import type { ReadingBook, ReadingProgress } from "../../../domain/reading/types";

export type ReadingRootTab = "shelf" | "co_reading" | "world";
export type ReadingShelfFilter = "all" | "reading" | "unread" | "finished" | "archived";
export type ReadingShelfSort = "recent" | "title" | "progress";

export interface ReadingActivityItem {
  id: string;
  sourceId: string;
  kind: "co_reading" | "co_story";
  userIdentityId: string;
  bookId?: string;
  bookTitle: string;
  relationId: string;
  characterId: string;
  friendName: string;
  friendAvatar?: string;
  status: string;
  updatedAt: number;
}

export interface ReadingWorldItem {
  id: string;
  sourceId: string;
  kind: "solo_story" | "co_story";
  userIdentityId: string;
  bookId?: string;
  title: string;
  friendName?: string;
  currentChapter: number;
  targetChapters: number;
  status: string;
  origin: "book" | "custom";
  genre?: string;
  synopsis?: string;
  updatedAt: number;
}

const bookTitle = (books: ReadingBook[], bookId?: string): string =>
  books.find((book) => book.id === bookId)?.title || "书籍已移除";

export function buildReadingActivityItems(input: {
  userIdentityId: string;
  rooms: ReadingRoom[];
  coStories: ReadingCoStoryState[];
  books: ReadingBook[];
}): ReadingActivityItem[] {
  const rooms = input.rooms
    .filter((room) => room.userIdentityId === input.userIdentityId)
    .map((room): ReadingActivityItem => ({
      id: `room:${room.readingRoomId}`,
      sourceId: room.readingRoomId,
      kind: "co_reading",
      userIdentityId: room.userIdentityId,
      bookId: room.bookId,
      bookTitle: bookTitle(input.books, room.bookId),
      relationId: room.relationId,
      characterId: room.characterId,
      friendName: room.characterSnapshot.name,
      friendAvatar: room.characterSnapshot.avatar,
      status: room.status,
      updatedAt: room.updatedAt,
    }));
  const coStories = input.coStories
    .filter((story) => story.userIdentityId === input.userIdentityId)
    .map((story): ReadingActivityItem => ({
      id: `co-story:${story.coStoryId}`,
      sourceId: story.coStoryId,
      kind: "co_story",
      userIdentityId: story.userIdentityId,
      bookId: story.universeStoryId,
      bookTitle: story.universeStoryId ? bookTitle(input.books, story.universeStoryId) : story.title,
      relationId: story.relationId,
      characterId: story.characterId,
      friendName: story.aiFriend.displayName,
      status: story.status,
      updatedAt: story.updatedAt,
    }));
  return [...rooms, ...coStories].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function buildReadingWorldItems(input: {
  userIdentityId: string;
  stories: ReadingStoryState[];
  coStories: ReadingCoStoryState[];
}): ReadingWorldItem[] {
  const solo = input.stories
    .filter((story) => story.userIdentityId === input.userIdentityId)
    .map((story): ReadingWorldItem => ({
      id: `solo-story:${story.storyId}`,
      sourceId: story.storyId,
      kind: "solo_story",
      userIdentityId: story.userIdentityId,
      bookId: story.bookId,
      title: story.title,
      currentChapter: story.currentChapter,
      targetChapters: story.targetChapters,
      status: story.status,
      origin: story.bookId ? "book" : "custom",
      updatedAt: story.updatedAt,
    }));
  const shared = input.coStories
    .filter((story) => story.userIdentityId === input.userIdentityId)
    .map((story): ReadingWorldItem => ({
      id: `co-story:${story.coStoryId}`,
      sourceId: story.coStoryId,
      kind: "co_story",
      userIdentityId: story.userIdentityId,
      bookId: story.universeStoryId,
      title: story.title,
      friendName: story.aiFriend.displayName,
      currentChapter: story.currentChapter,
      targetChapters: story.targetChapters,
      status: story.status,
      origin: story.origin || (story.universeStoryId ? "book" : "custom"),
      genre: story.worldDefinition?.genre,
      synopsis: story.worldDefinition?.synopsis,
      updatedAt: story.updatedAt,
    }));
  return [...solo, ...shared].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function selectReadingShelfBooks(input: {
  books: ReadingBook[];
  progress: ReadingProgress[];
  userIdentityId: string;
  filter: ReadingShelfFilter;
  query: string;
  sort: ReadingShelfSort;
}): ReadingBook[] {
  const progressByBook = new Map(input.progress
    .filter((item) => item.userIdentityId === input.userIdentityId)
    .map((item) => [item.bookId, item.percent]));
  const query = input.query.trim().toLocaleLowerCase("zh-CN");
  const selected = input.books.filter((book) => {
    if (book.userIdentityId !== input.userIdentityId) return false;
    if (input.filter === "archived") {
      if (book.status !== "archived") return false;
    } else if (book.status === "archived") return false;
    const percent = progressByBook.get(book.id) || 0;
    if (input.filter === "reading" && !(percent > 0 && percent < 100)) return false;
    if (input.filter === "unread" && percent > 0) return false;
    if (input.filter === "finished" && percent < 100) return false;
    if (query && !`${book.title} ${book.author || ""} ${book.sourceFileName}`.toLocaleLowerCase("zh-CN").includes(query)) return false;
    return true;
  });
  return selected.sort((left, right) => {
    if (input.sort === "title") return left.title.localeCompare(right.title, "zh-CN");
    if (input.sort === "progress") return (progressByBook.get(right.id) || 0) - (progressByBook.get(left.id) || 0);
    return right.updatedAt - left.updatedAt;
  });
}
