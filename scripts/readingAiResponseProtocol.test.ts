import assert from "node:assert/strict";
import { buildReadingMemoryCandidate, confirmReadingMemoryCandidate, validateReadingAiResponse } from "../src/features/reading/coReading/readingAiResponseProtocol";
import type { AiReadingContextProjection } from "../src/features/reading/coReading/aiReadingBoundary";
import type { ReadingRoom } from "../src/domain/reading/coReadingTypes";

const room: ReadingRoom = {
  userIdentityId: "identity-a", bookId: "book-a", readingRoomId: "room-a", relationId: "relation-a", characterId: "character-a", conversationId: "direct:relation-a",
  id: "room-a", status: "active", characterSnapshot: { characterId: "character-a", name: "AI" }, settings: { sharePreciseProgress: false, allowSummon: true, allowUnreadParagraphPreview: false, spoilerPolicy: "strict" }, invitedAt: 1, createdAt: 1, updatedAt: 1,
};
const known = { id: "anchor-known", userIdentityId: "identity-a", bookId: "book-a", chapterId: "chapter-1", ordinal: 0, normalizedTextHash: "hash", characterStart: 0, characterEnd: 5 };
const projection: AiReadingContextProjection = { scope: room, aiReadingPace: "normal", spoilerPolicy: "strict", knownFragments: [{ anchor: known, textSnapshot: "安全片段" }], userRevealedSpoilers: [], blockedAnchorIds: ["anchor-future"] };
const valid = validateReadingAiResponse({ kind: "comment", body: "我注意到这个细节。", targetParagraphAnchorId: known.id, source: "known", isSpoiler: false, memoryCandidate: { candidateId: "candidate-1", content: "用户和我确认了这个细节", importance: 7, targetParagraphAnchorId: known.id } }, { scope: room, projection });
assert.equal(valid.ok, true);
if (!valid.ok) throw new Error("unexpected invalid response");
const candidate = buildReadingMemoryCandidate({ response: valid.value, room, bookId: room.bookId, now: 10 });
assert.ok(candidate);
const confirmed = confirmReadingMemoryCandidate(candidate!, 11);
assert.equal(confirmed.relationId, "relation-a");
assert.equal(confirmed.sourceReadingRoomId, "room-a");
assert.equal(confirmed.sourceReadingEvidence?.paragraphAnchorId, known.id);
const future = validateReadingAiResponse({ kind: "comment", body: "剧透", targetParagraphAnchorId: "anchor-future", source: "known", isSpoiler: true }, { scope: room, projection });
assert.equal(future.ok, false);
const missingDisclosure = validateReadingAiResponse({ kind: "comment", body: "未知", source: "user_revealed", isSpoiler: true }, { scope: room, projection });
assert.equal(missingDisclosure.ok, false);
console.log("co-reading AI response protocol tests passed");
