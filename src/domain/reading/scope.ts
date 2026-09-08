import type { PersonalReadingScope, ReadingRoomScope } from "./types";

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function isValidPersonalReadingScope(scope: unknown): scope is PersonalReadingScope {
  if (!scope || typeof scope !== "object") return false;
  const candidate = scope as Partial<PersonalReadingScope>;
  return nonEmpty(candidate.userIdentityId) && nonEmpty(candidate.bookId);
}

export function isSamePersonalReadingScope(
  left: PersonalReadingScope,
  right: PersonalReadingScope,
): boolean {
  return isValidPersonalReadingScope(left)
    && isValidPersonalReadingScope(right)
    && left.userIdentityId === right.userIdentityId
    && left.bookId === right.bookId;
}

export function isValidReadingRoomScope(scope: unknown): scope is ReadingRoomScope {
  if (!isValidPersonalReadingScope(scope)) return false;
  const candidate = scope as Partial<ReadingRoomScope>;
  return nonEmpty(candidate.readingRoomId)
    && nonEmpty(candidate.relationId)
    && nonEmpty(candidate.characterId)
    && nonEmpty(candidate.conversationId);
}

export function isSameReadingRoomScope(
  left: ReadingRoomScope,
  right: ReadingRoomScope,
): boolean {
  return isValidReadingRoomScope(left)
    && isValidReadingRoomScope(right)
    && left.userIdentityId === right.userIdentityId
    && left.bookId === right.bookId
    && left.readingRoomId === right.readingRoomId
    && left.relationId === right.relationId
    && left.characterId === right.characterId
    && left.conversationId === right.conversationId;
}

export function filterByPersonalReadingScope<T extends PersonalReadingScope>(
  records: readonly T[],
  scope: PersonalReadingScope,
): T[] {
  if (!isValidPersonalReadingScope(scope)) return [];
  return records.filter((record) => isSamePersonalReadingScope(record, scope));
}

export function filterByReadingRoomScope<T extends ReadingRoomScope>(
  records: readonly T[],
  scope: ReadingRoomScope,
): T[] {
  if (!isValidReadingRoomScope(scope)) return [];
  return records.filter((record) => isSameReadingRoomScope(record, scope));
}
