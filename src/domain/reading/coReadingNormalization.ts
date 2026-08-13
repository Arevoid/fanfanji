import {
  CO_READING_STORE_VERSION,
  createEmptyCoReadingStore,
  type AiReadingState,
  type AiReadingSpoilerDisclosure,
  type CoReadingStore,
  type ReadingRoom,
} from "./coReadingTypes";

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object";
const string = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const optionalString = (value: unknown): value is string | undefined => value === undefined || typeof value === "string";
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const array = <T>(value: unknown, guard: (item: unknown) => item is T): T[] => Array.isArray(value) ? value.filter(guard) : [];

const isRange = (value: unknown): value is { start: number; end: number } =>
  record(value) && number(value.start) && number(value.end) && value.end >= value.start;

const isSpoilerDisclosure = (value: unknown): value is AiReadingSpoilerDisclosure =>
  record(value)
  && string(value.id)
  && string(value.chapterId)
  && string(value.paragraphAnchorId)
  && typeof value.textSnapshot === "string"
  && value.textSnapshot.length <= 8000
  && number(value.disclosedAt);

const isRoom = (value: unknown): value is ReadingRoom => {
  if (!record(value)) return false;
  const snapshot = value.characterSnapshot;
  const settings = value.settings;
  return string(value.id)
    && string(value.userIdentityId)
    && string(value.bookId)
    && string(value.readingRoomId)
    && string(value.relationId)
    && string(value.characterId)
    && string(value.conversationId)
    && ["invited", "active", "paused", "ended", "declined"].includes(String(value.status))
    && record(snapshot) && string(snapshot.characterId) && string(snapshot.name) && optionalString(snapshot.avatar)
    && record(settings)
    && typeof settings.sharePreciseProgress === "boolean"
    && typeof settings.allowSummon === "boolean"
    && typeof settings.allowUnreadParagraphPreview === "boolean"
    && ["strict", "shared_fragment_only", "allow_user_spoilers"].includes(String(settings.spoilerPolicy))
    && [undefined, "accept", "hesitate", "decline"].includes(value.invitationDecision as never)
    && optionalString(value.invitationReplyText)
    && number(value.invitedAt)
    && (value.respondedAt === undefined || number(value.respondedAt))
    && (value.endedAt === undefined || number(value.endedAt))
    && number(value.createdAt)
    && number(value.updatedAt);
};

const isAiReadingState = (value: unknown): value is AiReadingState => {
  if (!record(value)) return false;
  const ranges = value.aiKnownParagraphRange;
  const cursor = value.aiReadingCursor;
  const validCursor = cursor === null || (record(cursor) && string(cursor.id) && string(cursor.bookId) && string(cursor.chapterId) && string(cursor.userIdentityId));
  return string(value.userIdentityId)
    && string(value.bookId)
    && string(value.readingRoomId)
    && string(value.relationId)
    && string(value.characterId)
    && string(value.conversationId)
    && validCursor
    && Array.isArray(value.aiKnownChapterIds)
    && value.aiKnownChapterIds.every(string)
    && record(ranges)
    && Object.values(ranges).every(isRange)
    && ["slow", "normal", "fast", "persona_driven"].includes(String(value.aiReadingPace))
    && (value.lastCommentedAnchor === undefined || (record(value.lastCommentedAnchor) && string(value.lastCommentedAnchor.id)))
    && ["off", "rare", "moderate", "active"].includes(String(value.autonomousCommentFrequency))
    && ["strict", "shared_fragment_only", "allow_user_spoilers"].includes(String(value.spoilerPolicy))
    && (value.userRevealedSpoilers === undefined || (Array.isArray(value.userRevealedSpoilers) && value.userRevealedSpoilers.every(isSpoilerDisclosure)))
    && number(value.updatedAt);
};

const dedupe = <T>(items: readonly T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

export function normalizeCoReadingStore(value: unknown): CoReadingStore {
  if (!record(value) || value.version !== CO_READING_STORE_VERSION) return createEmptyCoReadingStore();
  const rooms = dedupe(array(value.rooms, isRoom), (room) => `${room.userIdentityId}:${room.readingRoomId}`);
  const roomKeys = new Set(rooms.map((room) => `${room.userIdentityId}:${room.readingRoomId}`));
  const belongsToRoom = (item: { userIdentityId: string; readingRoomId: string }): boolean => roomKeys.has(`${item.userIdentityId}:${item.readingRoomId}`);
  const aiReadingStates = dedupe(
    array(value.aiReadingStates, isAiReadingState).filter(belongsToRoom),
    (state) => `${state.userIdentityId}:${state.readingRoomId}`,
  ).map((state) => ({ ...state, userRevealedSpoilers: state.userRevealedSpoilers || [] }));
  return { version: CO_READING_STORE_VERSION, rooms, aiReadingStates };
}
