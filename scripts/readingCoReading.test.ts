import assert from "node:assert/strict";
import { createAiReadingRoom, respondToReadingInvitation } from "../src/features/reading/coReading/readingCoReading";
import { getAiReadingState, getReadingRoom, getReadingRoomProgress, listReadingRooms, saveReadingRoomProgress } from "../src/core/storage/repositories/readingCoReadingRepository";
import { storageKeys } from "../src/core/storage/storageKeys";
import type { ReadingBook } from "../src/domain/reading/types";
import type { Character } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });

const book: ReadingBook = {
  id: "book-shared", userIdentityId: "identity-a", assetId: "asset-a", contentHash: "hash-a", format: "txt", status: "ready", title: "Shared Book", sourceFileName: "book.txt", sourceMimeType: "text/plain", sourceEncoding: "utf-8", byteLength: 100, wordCount: 50, chapterCount: 2, createdAt: 1, updatedAt: 1,
};
const character: Character = { id: "character-shared", name: "同一个角色", avatar: "🙂", personality: "安静", backstory: "" };
const relationA: CharacterRelationship = { id: "relation-a", characterId: character.id, userIdentityId: "identity-a", conversationId: "direct:relation-a", relationship: "friend", createdAt: 1, updatedAt: 1 };
const relationB: CharacterRelationship = { ...relationA, id: "relation-b", conversationId: "direct:relation-b" };

const roomA = createAiReadingRoom({ userIdentityId: "identity-a", book, relationship: relationA, character, now: 10 });
assert.throws(() => createAiReadingRoom({ userIdentityId: "identity-a", book, relationship: relationA, character, now: 10 }), /已经有一个共读房间/);
const roomB = createAiReadingRoom({ userIdentityId: "identity-a", book, relationship: relationB, character, now: 11 });
assert.notEqual(roomA.readingRoomId, roomB.readingRoomId, "same book and character still get different rooms");
assert.equal(listReadingRooms("identity-a", book.id).length, 2);
assert.equal(getReadingRoom(roomA)?.relationId, relationA.id);
assert.equal(getReadingRoom(roomB)?.relationId, relationB.id);
assert.equal(getAiReadingState(roomA)?.aiKnownChapterIds.length, 0);

respondToReadingInvitation({ scope: roomA, decision: "accept", replyText: "我想和你一起读。", now: 20 });
assert.equal(getReadingRoom(roomA)?.status, "active");
assert.equal(getReadingRoom(roomB)?.status, "invited", "accepting A must not change B");

assert.deepEqual(saveReadingRoomProgress({ ...roomA, chapterId: "chapter-a", paragraphAnchorId: "anchor-a", characterOffset: 4, percent: 12, updatedAt: 30 }), { success: true });
assert.deepEqual(saveReadingRoomProgress({ ...roomB, chapterId: "chapter-b", paragraphAnchorId: "anchor-b", characterOffset: 8, percent: 67, updatedAt: 31 }), { success: true });
assert.equal(getReadingRoomProgress(roomA)?.percent, 12);
assert.equal(getReadingRoomProgress(roomB)?.percent, 67, "the same book must keep a separate user cursor for every friend room");

const wrongRoom = { ...roomA, readingRoomId: roomB.readingRoomId };
assert.equal(getReadingRoom(wrongRoom), undefined, "changing only room id cannot cross-read");
assert.equal(localStorage.getItem(storageKeys.readingCoReadingStore)?.includes(roomA.readingRoomId), true);

localStorage.setItem(storageKeys.readingCoReadingStore, JSON.stringify({ version: 999, rooms: [roomA], aiReadingStates: [] }));
assert.equal(listReadingRooms("identity-a").length, 0, "unknown versions fail closed");

console.log("reading co-reading room isolation tests passed");
