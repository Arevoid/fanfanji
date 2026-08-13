import assert from "node:assert/strict";
import { buildReadingActivityItems, buildReadingWorldItems, selectReadingShelfBooks } from "../src/features/reading/navigation/readingNavigation";
import type { ReadingRoom } from "../src/domain/reading/coReadingTypes";
import type { ReadingCoStoryState } from "../src/domain/reading/coStoryTypes";
import type { ReadingStoryState } from "../src/domain/reading/storyTypes";
import type { ReadingBook, ReadingProgress } from "../src/domain/reading/types";

const now = 1_000;
const book = { id: "book-1", userIdentityId: "user-1", title: "灯塔", author: "阿甲", sourceFileName: "灯塔.txt", status: "ready", updatedAt: now } as ReadingBook;
const room = (id: string, relationId: string, friendName: string, userIdentityId = "user-1"): ReadingRoom => ({
  id, readingRoomId: id, userIdentityId, bookId: book.id, relationId, characterId: `character-${relationId}`, conversationId: `conversation-${relationId}`,
  status: "active", characterSnapshot: { characterId: `character-${relationId}`, name: friendName }, settings: { sharePreciseProgress: false, allowSummon: true, allowUnreadParagraphPreview: false, spoilerPolicy: "strict" }, invitedAt: now, createdAt: now, updatedAt: now,
});
const coStory = { userIdentityId: "user-1", coStoryId: "co-1", relationId: "relation-a", characterId: "character-a", universeStoryId: book.id, title: "灯塔：岔路", length: "short", status: "active", currentChapter: 1, targetChapters: 3, currentLocation: "港口", currentTime: "夜", userCharacterName: "我", userGoals: [], aiFriend: { relationId: "relation-a", characterId: "character-a", displayName: "小满", characterName: "小满", personaSummary: "谨慎", knownIntel: [], knownTurnIds: [] }, activeActor: "user", createdAt: now, updatedAt: now } as ReadingCoStoryState;

const activities = buildReadingActivityItems({ userIdentityId: "user-1", rooms: [room("room-a", "relation-a", "小满"), room("room-b", "relation-b", "阿禾"), room("room-x", "relation-x", "越界", "user-2")], coStories: [coStory], books: [book] });
assert.equal(activities.filter((item) => item.kind === "co_reading").length, 2, "同书不同好友必须保留两个独立房间");
assert.equal(activities.some((item) => item.friendName === "越界"), false, "不能展示其他身份的数据");

const soloStory = { userIdentityId: "user-1", storyId: "solo-1", bookId: book.id, title: "独行灯塔", currentChapter: 2, targetChapters: 8, status: "active", updatedAt: now } as ReadingStoryState;
const worlds = buildReadingWorldItems({ userIdentityId: "user-1", stories: [soloStory], coStories: [coStory] });
const sharedActivity = activities.find((item) => item.kind === "co_story");
const sharedWorld = worlds.find((item) => item.kind === "co_story");
assert.equal(sharedActivity, undefined, "穿书卡片不能混入共读栏目");
assert.equal(sharedWorld?.sourceId, coStory.coStoryId, "共同穿书只显示在世界栏目");

const unreadBook = { ...book, id: "book-2", title: "远山", updatedAt: now + 1 };
const progress = [{ userIdentityId: "user-1", bookId: book.id, percent: 50 }] as ReadingProgress[];
assert.deepEqual(selectReadingShelfBooks({ books: [book, unreadBook], progress, userIdentityId: "user-1", filter: "reading", query: "", sort: "recent" }).map((item) => item.id), [book.id]);
assert.deepEqual(selectReadingShelfBooks({ books: [book, unreadBook], progress, userIdentityId: "user-1", filter: "all", query: "阿甲", sort: "recent" }).map((item) => item.id), [unreadBook.id, book.id]);

console.log("reading navigation tests passed");
