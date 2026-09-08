import assert from "node:assert/strict";
import { saveReadingStore } from "../src/core/storage/repositories/readingRepository";
import { createAiReadingRoom } from "../src/features/reading/coReading/readingCoReading";
import { advanceAiReadingToParagraph, buildAiReadingContext, isAiParagraphKnown, recordUserRevealedSpoiler } from "../src/features/reading/coReading/aiReadingBoundary";
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
const book: ReadingBook = { id: "book-boundary", userIdentityId: "identity-a", assetId: "asset", contentHash: "hash", format: "txt", status: "ready", title: "Boundary", sourceFileName: "book.txt", sourceMimeType: "text/plain", sourceEncoding: "utf-8", byteLength: 10, wordCount: 30, chapterCount: 2, createdAt: 1, updatedAt: 1 };
const anchors = [
  { id: "anchor-1", userIdentityId: "identity-a", bookId: book.id, chapterId: "chapter-1", ordinal: 0, normalizedTextHash: "1", characterStart: 0, characterEnd: 5 },
  { id: "anchor-2", userIdentityId: "identity-a", bookId: book.id, chapterId: "chapter-1", ordinal: 1, normalizedTextHash: "2", characterStart: 5, characterEnd: 10 },
  { id: "anchor-3", userIdentityId: "identity-a", bookId: book.id, chapterId: "chapter-2", ordinal: 0, normalizedTextHash: "3", characterStart: 10, characterEnd: 15 },
];
const store: ReadingStore = { version: 1, books: [book], chapters: [
  { id: "chapter-1", userIdentityId: "identity-a", bookId: book.id, order: 0, title: "One", firstParagraphAnchorId: "anchor-1", lastParagraphAnchorId: "anchor-2", wordCount: 10 },
  { id: "chapter-2", userIdentityId: "identity-a", bookId: book.id, order: 1, title: "Two", firstParagraphAnchorId: "anchor-3", lastParagraphAnchorId: "anchor-3", wordCount: 10 },
], paragraphAnchors: anchors, progress: [], annotations: [], preferences: [], assetCleanupTasks: [] };
saveReadingStore(store);
const character: Character = { id: "character", name: "AI Friend", avatar: "", personality: "", backstory: "" };
const relationship: CharacterRelationship = { id: "relation", characterId: character.id, userIdentityId: "identity-a", conversationId: "direct:relation", relationship: "friend", createdAt: 1, updatedAt: 1 };
const room = createAiReadingRoom({ userIdentityId: "identity-a", book, relationship, character, now: 2 });

advanceAiReadingToParagraph({ scope: room, paragraphAnchorId: "anchor-2", now: 3 });
assert.equal(isAiParagraphKnown(room, "anchor-1"), true);
assert.equal(isAiParagraphKnown(room, "anchor-2"), true);
assert.equal(isAiParagraphKnown(room, "anchor-3"), false, "future chapter is blocked");
const projection = buildAiReadingContext(room, anchors.map((anchor) => ({ anchor, textSnapshot: `text-${anchor.id}` })));
assert.deepEqual(projection.knownFragments.map((item) => item.anchor.id), ["anchor-1", "anchor-2"]);
assert.deepEqual(projection.blockedAnchorIds, ["anchor-3"]);
recordUserRevealedSpoiler({ scope: room, paragraphAnchorId: "anchor-3", textSnapshot: "text-anchor-3", now: 4 });
const withSpoiler = buildAiReadingContext(room, [{ anchor: anchors[2], textSnapshot: "text-anchor-3" }]);
assert.deepEqual(withSpoiler.userRevealedSpoilers.map((item) => item.anchor.id), ["anchor-3"]);
assert.equal(isAiParagraphKnown(room, "anchor-3"), false, "explicit disclosure must not advance normal cursor");
const otherScope = { ...room, readingRoomId: "other-room", relationId: "other-relation", conversationId: "direct:other" };
assert.throws(() => buildAiReadingContext(otherScope, []), /不存在/);
console.log("AI reading boundary and spoiler projection tests passed");
