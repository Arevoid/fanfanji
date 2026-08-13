import assert from "node:assert/strict";
import { saveReadingStore } from "../src/core/storage/repositories/readingRepository";
import { listDiscussionMessages, listReadingComments, startReadingDiscussion, createAiReadingComment, createUserReadingComment } from "../src/features/reading/coReading/readingCoReadingContent";
import { createAiReadingRoom } from "../src/features/reading/coReading/readingCoReading";
import { advanceAiReadingToParagraph } from "../src/features/reading/coReading/aiReadingBoundary";
import type { ReadingBook, ReadingStore } from "../src/domain/reading/types";
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
const book: ReadingBook = { id: "book-content", userIdentityId: "identity-a", assetId: "asset", contentHash: "hash", format: "txt", status: "ready", title: "Content", sourceFileName: "book.txt", sourceMimeType: "text/plain", sourceEncoding: "utf-8", byteLength: 10, wordCount: 20, chapterCount: 1, createdAt: 1, updatedAt: 1 };
const anchor = { id: "anchor-content", userIdentityId: "identity-a", bookId: book.id, chapterId: "chapter-content", ordinal: 0, normalizedTextHash: "hash", characterStart: 0, characterEnd: 5 };
const store: ReadingStore = { version: 1, books: [book], chapters: [{ id: anchor.chapterId, userIdentityId: "identity-a", bookId: book.id, order: 0, title: "One", firstParagraphAnchorId: anchor.id, lastParagraphAnchorId: anchor.id, wordCount: 20 }], paragraphAnchors: [anchor], progress: [], annotations: [], preferences: [], assetCleanupTasks: [] };
saveReadingStore(store);
const character: Character = { id: "character-content", name: "Reader AI", avatar: "", personality: "", backstory: "" };
const relationship: CharacterRelationship = { id: "relation-content", characterId: character.id, userIdentityId: "identity-a", conversationId: "direct:content", relationship: "friend", createdAt: 1, updatedAt: 1 };
const room = createAiReadingRoom({ userIdentityId: "identity-a", book, relationship, character, now: 2 });
advanceAiReadingToParagraph({ scope: room, paragraphAnchorId: anchor.id, now: 3 });

createUserReadingComment({ scope: room, authorName: "我", kind: "book", body: "这本书的开场很有画面感。", now: 4 });
createAiReadingComment({ scope: room, authorName: character.name, targetParagraphAnchorId: anchor.id, textSnapshot: "第一段", body: "我也注意到了这个细节。", now: 5 });
assert.equal(listReadingComments(room).length, 2);
assert.throws(() => createAiReadingComment({ scope: room, authorName: character.name, targetParagraphAnchorId: "future", textSnapshot: "未来", body: "不应越界" }), /不存在|尚未读到/);

const discussion = startReadingDiscussion({ scope: room, authorName: "我", userPrompt: "你觉得这个开场暗示了什么？", now: 6 });
assert.equal(listDiscussionMessages(room, discussion.id).length, 1);
const otherRoom = { ...room, readingRoomId: "other-room", relationId: "other-relation", conversationId: "direct:other" };
assert.equal(listReadingComments(otherRoom).length, 0);
assert.equal(listDiscussionMessages(otherRoom, discussion.id).length, 0);

console.log("co-reading comments and discussion isolation tests passed");
