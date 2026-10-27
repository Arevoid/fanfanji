import assert from "node:assert/strict";
import { archiveSharedMediaMemory } from "../src/features/characterKnowledge/services/sharedMediaMemoryService";
import { loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries } from "../src/core/storage/repositories/conversationSummaryRepository";
import { buildMemoryContext } from "../src/features/characterKnowledge/services/memoryContextGateway";
import type { UserSettings } from "../src/types";
import { saveCinemaStore } from "../src/core/storage/repositories/cinemaRepository";
import { archiveCinemaDiscussion } from "../src/features/cinema/cinemaMemoryArchiveService";
import { saveCoReadingStore } from "../src/core/storage/repositories/readingCoReadingRepository";
import { createEmptyCoReadingStore, DEFAULT_READING_ROOM_SETTINGS } from "../src/domain/reading/coReadingTypes";
import { archiveReadingExperience } from "../src/features/reading/coReading/readingMemoryArchiveService";
import { storageKeys } from "../src/core/storage/storageKeys";
const values = new Map<string, string>(); let fail = false;
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (fail && key === storageKeys.conversationSummaries) { fail = false; throw Error("quota"); } values.set(key, value); },
  removeItem: (key: string) => values.delete(key),
} } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const input = { scope, app: "reading" as const, recordId: "discussion", title: "星空小说", now: 200,
  messages: [{ id: "m1", author: "user" as const, text: "小说里主角害怕打雷，我觉得这个人物有趣。", occurredAt: 100 },
    { id: "m2", author: "character" as const, text: "我也喜欢这个人物的转变。", occurredAt: 101 }] };
assert.ok(archiveSharedMediaMemory(input).success);
const first = loadKnowledgeClaims().value;
assert.equal(first.length, 1); assert.equal(first[0].subject, "relationship");
assert.doesNotMatch(first[0].statement, /用户害怕打雷/);
assert.equal(first[0].source.retainedSnapshot, true);
assert.match(loadConversationSummaries().value[0].summary, /作品内容与台词不属于现实经历/);
assert.ok(archiveSharedMediaMemory(input).success); assert.equal(loadKnowledgeClaims().value.length, 1);
assert.equal(loadConversationSummaries().value.length, 1, "unchanged archives are idempotent");
assert.ok(archiveSharedMediaMemory({ ...input, now: 300, messages: [...input.messages, { id: "m3", author: "user", text: "后来的人物发展更有意思。", occurredAt: 250 }] }).success);
assert.equal(loadKnowledgeClaims().value.filter((claim) => !claim.supersededById).length, 1);
assert.ok(loadConversationSummaries().value.some((summary) => summary.status === "stale"));
const long = "开头的讨论。" + "小说角色的选择很复杂。".repeat(400) + "结尾也值得讨论。";
assert.ok(archiveSharedMediaMemory({ ...input, recordId: "long", messages: [{ ...input.messages[0], text: long }] }).success);
const joined = loadConversationSummaries().value.filter((summary) => summary.status !== "stale").map((summary) => summary.summary).join("");
assert.match(joined, /开头的讨论/); assert.match(joined, /结尾也值得讨论/);
assert.equal(archiveSharedMediaMemory({ ...input, recordId: "bad", messages: [input.messages[1]] }).success, false);
const relation = { id: "r", characterId: "a", userIdentityId: "u", conversationId: "c", relationship: "friend" as const, createdAt: 1, updatedAt: 1 };
const readingScope = { ...scope, bookId: "book", readingRoomId: "reading-room" };
const readingRoom = { ...readingScope, id: "reading-room", status: "active" as const, characterSnapshot: { characterId: "a", name: "角色" },
  settings: DEFAULT_READING_ROOM_SETTINGS, invitedAt: 1, createdAt: 1, updatedAt: 1 };
assert.ok(saveCoReadingStore({ ...createEmptyCoReadingStore(), rooms: [readingRoom],
  discussions: [{ ...readingScope, id: "read-talk", status: "open", userPrompt: "讨论人物", createdAt: 100, updatedAt: 101 }],
  discussionMessages: [{ ...readingScope, id: "reading-user", discussionId: "read-talk", author: "user", authorName: "用户", body: "小说角色害怕打雷。", source: "user_revealed", createdAt: 100 },
    { ...readingScope, id: "reading-ai", discussionId: "read-talk", author: "ai", authorName: "角色", body: "这个情节很有意思。", source: "known", createdAt: 101 }] }).success);
assert.ok(archiveReadingExperience({ scope: readingScope, relation, title: "星空小说", discussionId: "read-talk", now: 300 }).success);
assert.equal(archiveReadingExperience({ scope: readingScope, relation: { ...relation, id: "foreign" }, title: "星空小说", discussionId: "read-talk" }).success, false);
const beforeFailure = [loadKnowledgeClaims().value, loadConversationSummaries().value]; fail = true;
assert.equal(archiveSharedMediaMemory({ ...input, recordId: "quota-test" }).success, false);
assert.deepEqual([loadKnowledgeClaims().value, loadConversationSummaries().value], beforeFailure, "failed second-store write rolls back both stores");
const cinema = { schemaVersion: 1 as const, media: [{ id: "film", ownerIdentityId: "u", title: "星空电影", mimeType: "video/mp4", durationMs: 100,
  video: { assetId: "asset", kind: "video" as const, mimeType: "video/mp4", byteLength: 1 }, createdAt: 1, updatedAt: 1, lastPositionMs: 0, watchedUntilMs: 0 }],
  rooms: [{ ...scope, id: "room", mediaId: "film", createdAt: 1, updatedAt: 1, positionMs: 0, watchedUntilMs: 0, autoReactionEnabled: false }],
  discussions: [{ ...scope, id: "movie-discussion", roomId: "room", mediaId: "film", positionMs: 0, userText: "小说和电影中的人物选择不同。", characterText: "我觉得改编有意思。", createdAt: 100 }] };
assert.ok(saveCinemaStore(cinema)); assert.ok(archiveCinemaDiscussion({ relation, discussionId: "movie-discussion", now: 300 }).success);
assert.equal(archiveCinemaDiscussion({ relation: { ...relation, userIdentityId: "other" }, discussionId: "movie-discussion" }).success, false);
assert.ok(saveCinemaStore({ ...cinema, media: [{ ...cinema.media[0], ownerIdentityId: "other" }] }));
assert.equal(archiveCinemaDiscussion({ relation, discussionId: "movie-discussion" }).success, false, "foreign-owned media cannot be archived through a matching room");
for (const surface of ["reading", "cinema"] as const) {
  const text = await buildMemoryContext({ surface, relation, characterId: "a", userIdentityId: "u", query: "星空小说", settings: {} as UserSettings, audience: "relation_private", maxCharacters: 250 });
  assert.ok(text.length <= 250, "media safety guidance shares the prompt budget");
  assert.equal(await buildMemoryContext({ surface, relation, characterId: "foreign", userIdentityId: "u", query: "星空小说", settings: {} as UserSettings, audience: "relation_private" }), "");
}
console.log("PASS media snapshots: actual quoted exchange, fiction boundary, durable source versioning, idempotence, long coverage, scope and total prompt budget; deterministic storage only");
