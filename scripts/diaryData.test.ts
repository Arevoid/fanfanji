import assert from "node:assert/strict";
import { isValidDiaryEntry, validateGeneratedDiaryContent } from "../src/domain/diary/diaryValidation";
import { cleanupDiaryForRelations } from "../src/domain/diary/diaryCleanup";
import type { DiaryEntry } from "../src/types";

const user: DiaryEntry = { id: "u", ownerIdentityId: "i1", authorType: "user", authorNameSnapshot: "我", body: "今天的天气很好，认真写下这篇日记。", tags: [], occurredAt: Date.now(), createdAt: 1, updatedAt: 1, source: "manual", isFavorite: false };
const character: DiaryEntry = { ...user, id: "c", authorType: "character", characterId: "char", relationId: "r1", conversationId: "conv-r1", source: "ai-manual" };
assert.equal(isValidDiaryEntry(user), true);
assert.equal(isValidDiaryEntry(character), true);
assert.equal(isValidDiaryEntry({ ...user, relationId: "r1" }), false, "user diary must not gain a relation scope");
assert.equal(validateGeneratedDiaryContent({ body: "这是足够长的一段自然日记内容，没有泄露任何内部信息。", tags: ["日常"] })?.body.length! > 20, true);
assert.equal(validateGeneratedDiaryContent({ body: "prompt system model relationId characterId memory 内容足够长。", tags: [] }), null);
const cleaned = cleanupDiaryForRelations({ relationIds: ["r1"], entries: [user, character], shares: [{ id: "s", diaryEntryId: "c", ownerIdentityId: "i1", targetRelationId: "r1", conversationId: "conv-r1", messageId: "m", snapshot: { authorType: "character", authorName: "TA", body: "内容", occurredAt: 1 }, createdAt: 1 }], tasks: [{ id: "t", ownerIdentityId: "i1", relationId: "r1", taskKey: "t", trigger: "manual", status: "completed", startedAt: 1, updatedAt: 1 }], translations: [{ id: "tr", ownerIdentityId: "i1", diaryEntryId: "c", sourceContentHash: "h", targetLanguage: "zh-CN", translatedBody: "内容", createdAt: 1, lastAccessedAt: 1 }] });
assert.deepEqual(cleaned.entries.map((entry) => entry.id), ["u"]); assert.equal(cleaned.shares.length, 0); assert.equal(cleaned.tasks.length, 0); assert.equal(cleaned.translations.length, 0);
console.log("diary data tests passed");
