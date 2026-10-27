import assert from "node:assert/strict";
import { saveKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { buildMemoryContext } from "../src/features/characterKnowledge/services/memoryContextGateway";
import { generateDiaryEntry } from "../src/features/diary/services/diaryGenerationService";
import { requestReadingCompanionResponse } from "../src/features/reading/coReading/readingCompanionService";
import { requestCinemaMemoryReply } from "../src/features/cinema/cinemaMemoryReply";
import { buildRelationMomentContext } from "../src/features/moments/services/momentRelationContext";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { Character, UserSettings, Message } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { ReadingRoom } from "../src/domain/reading/coReadingTypes";
import { createEmptyCoReadingStore } from "../src/domain/reading/coReadingTypes";
import { saveCoReadingStore } from "../src/core/storage/repositories/readingCoReadingRepository";
import { saveReadingStore } from "../src/core/storage/repositories/readingRepository";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
} } });
const relation: CharacterRelationship = { id: "relation-a", characterId: "character-a", userIdentityId: "identity-a", conversationId: "direct:relation-a", relationship: "friend", createdAt: 1, updatedAt: 1 };
const character: Character = { id: "character-a", name: "林澈", avatar: "", personality: "体贴", backstory: "" };
const claim: KnowledgeClaim = { id: "thunder", characterId: relation.characterId, relationId: relation.id, userIdentityId: relation.userIdentityId, conversationId: relation.conversationId,
  statement: "用户害怕打雷", kind: "fact", subject: "user", temporalStatus: "present", truthStatus: "asserted", confidence: 0.85, userConfirmed: false,
  status: "active", schemaVersion: 1, visibility: "relation_private", recordedAt: 1,
  source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: "source", messageIds: ["source"] } };
assert.ok(saveKnowledgeClaims([claim, { ...claim, id: "foreign-secret", statement: "打雷时外国关系的秘密口令是秘密字串", relationId: "foreign" }]).success);
const settings = { apiKey: "synthetic-key", selectedModel: "synthetic-model" } as UserSettings;
for (const surface of ["chat", "regenerate", "offline", "diary", "reading", "cinema", "moment", "forum", "group"] as const) {
  const context = await buildMemoryContext({ surface, relation, characterId: character.id, userIdentityId: relation.userIdentityId,
    settings, query: "打雷", audience: "relation_private" });
  assert.match(context, /用户害怕打雷/); assert.doesNotMatch(context, /秘密字串/);
  assert.equal(await buildMemoryContext({ surface, relation, characterId: character.id, userIdentityId: relation.userIdentityId, settings, query: "打雷", audience: "shared_group" }), "");
}
let diaryPrompt = "";
const diary = await generateDiaryEntry({ relation, character, ownerIdentityId: relation.userIdentityId, settings, trigger: "manual",
  messages: [{ id: "recent", sender: "user", characterId: character.id, relationId: relation.id, content: "今天打雷", timestamp: 100 } as Message],
  chat: async (params) => { diaryPrompt = params.systemInstruction || ""; return { text: JSON.stringify({ body: "今天雨声很大，我想起了相处中的点滴，也更加留意说话时的语气和分寸。", tags: [] }) }; } });
assert.ok(diary.entry); assert.match(diaryPrompt, /用户害怕打雷/); assert.doesNotMatch(diaryPrompt, /秘密字串/);
const room: ReadingRoom = { userIdentityId: relation.userIdentityId, bookId: "book-a", readingRoomId: "room-a", relationId: relation.id,
  characterId: character.id, conversationId: relation.conversationId, id: "room-a", status: "active", characterSnapshot: { characterId: character.id, name: character.name },
  settings: { sharePreciseProgress: false, allowSummon: true, allowUnreadParagraphPreview: false, spoilerPolicy: "strict" }, invitedAt: 1, createdAt: 1, updatedAt: 1 };
const anchor = { id: "anchor-a", userIdentityId: relation.userIdentityId, bookId: "book-a", chapterId: "chapter-a", ordinal: 0, normalizedTextHash: "hash", characterStart: 0, characterEnd: 6 };
saveReadingStore({ version: 1, books: [{ id: "book-a", userIdentityId: relation.userIdentityId, assetId: "asset", contentHash: "hash", format: "txt", status: "ready",
  title: "测试书", sourceFileName: "test.txt", sourceMimeType: "text/plain", sourceEncoding: "utf-8", byteLength: 6, wordCount: 6, chapterCount: 1, createdAt: 1, updatedAt: 1 }], chapters: [{ id: "chapter-a", userIdentityId: relation.userIdentityId, bookId: "book-a", order: 0,
  title: "片段", firstParagraphAnchorId: anchor.id, lastParagraphAnchorId: anchor.id, wordCount: 6 }], paragraphAnchors: [anchor], progress: [], annotations: [], preferences: [], assetCleanupTasks: [] });
saveCoReadingStore({ ...createEmptyCoReadingStore(), rooms: [room], aiReadingStates: [{ ...room, aiReadingCursor: anchor,
  aiKnownChapterIds: [anchor.chapterId], aiKnownParagraphRange: { [anchor.chapterId]: { start: 0, end: 0 } }, aiReadingPace: "persona_driven",
  autonomousCommentFrequency: "moderate", spoilerPolicy: "strict", userRevealedSpoilers: [], updatedAt: 1 }] });
let readingPrompt = "";
const reading = await requestReadingCompanionResponse({ room, character, relationship: relation, settings, paragraph: { anchor, text: "窗外传来雷声。" },
  kind: "discussion_reply", userPrompt: "这段打雷让我紧张", request: async (params) => {
    readingPrompt = params.systemInstruction || "";
    return { text: JSON.stringify({ kind: "discussion_reply", body: "慢慢看，先缓一缓。", targetParagraphAnchorId: anchor.id, source: "known", isSpoiler: false }) };
  } });
assert.ok(reading); assert.match(readingPrompt, /用户害怕打雷/); assert.doesNotMatch(readingPrompt, /秘密字串/);
let cinemaPrompt = "";
await requestCinemaMemoryReply({ relation, characterId: character.id, userIdentityId: relation.userIdentityId, settings, query: "打雷",
  params: { message: "已播放片段中打雷", history: [], systemInstruction: "仅讨论已播放内容", apiKey: "synthetic-key", model: "synthetic-model" },
  request: async (params) => { cinemaPrompt = params.systemInstruction || ""; return { text: "先缓一缓" }; } });
assert.match(cinemaPrompt, /用户害怕打雷/); assert.match(cinemaPrompt, /仅讨论已播放内容/); assert.doesNotMatch(cinemaPrompt, /秘密字串/);
const publicMoment = buildRelationMomentContext({ character, relationship: relation, occurredAt: Date.now(), knowledgeClaims: [claim], memories: [], events: [], publicSurface: true });
assert.equal(publicMoment.knownFacts.length, 0, "public moment does not receive a private relation dump");
console.log("PASS memory surfaces: all gateway scopes, public/group exclusions, actual diary and reading request prompts, public moment privacy");
