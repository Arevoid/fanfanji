import {
  CHARACTER_EVENT_SCHEMA_VERSION,
  type CharacterEvent,
  type CharacterEventInput,
} from "./characterEventTypes";
import {
  createCharacterLifeEventKey,
  isNonEmptyCharacterLifeId,
  type CharacterLifeEventKey,
} from "./characterLifeTypes";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const readOptionalFiniteNumber = (value: unknown, fallback: number): number | undefined =>
  value === undefined ? fallback : isFiniteNumber(value) ? value : undefined;

/**
 * Converts persisted records from the first event shape without guessing a
 * relationship. Scope fields are intentionally mandatory even for legacy data.
 */
export function normalizeCharacterEvent(value: unknown, now = Date.now()): CharacterEvent | undefined {
  if (!isRecord(value)) return undefined;

  const relationId = value.relationId;
  const characterId = value.characterId;
  const userIdentityId = value.userIdentityId;
  const id = value.id;
  const kind = value.kind;
  const summary = value.summary;
  const source = value.source;
  const occurredAt = value.occurredAt;
  const status = value.status === undefined ? "active" : value.status;
  const recordedAt = readOptionalFiniteNumber(value.recordedAt, isFiniteNumber(occurredAt) ? occurredAt : now);
  const confidence = readOptionalFiniteNumber(value.confidence, 1);
  const schemaVersion = value.schemaVersion === undefined ? CHARACTER_EVENT_SCHEMA_VERSION : value.schemaVersion;

  if (!isNonEmptyCharacterLifeId(relationId)
    || !isNonEmptyCharacterLifeId(characterId)
    || !isNonEmptyCharacterLifeId(userIdentityId)
    || !isNonEmptyCharacterLifeId(id)
    || !isNonEmptyCharacterLifeId(kind)
    || !isNonEmptyCharacterLifeId(summary)
    || !isNonEmptyCharacterLifeId(source)
    || !isNonEmptyCharacterLifeId(status)
    || !isFiniteNumber(occurredAt)
    || recordedAt === undefined
    || confidence === undefined
    || !isFiniteNumber(schemaVersion)
    || !Number.isInteger(schemaVersion)
    || schemaVersion < 1
    || confidence < 0
    || confidence > 1) return undefined;

  return {
    id: id.trim(),
    relationId: relationId.trim(),
    characterId: characterId.trim(),
    userIdentityId: userIdentityId.trim(),
    kind: kind.trim(),
    summary: summary.trim(),
    source: source.trim(),
    occurredAt,
    recordedAt,
    confidence,
    status: status.trim(),
    schemaVersion,
  };
}

export const isCharacterEvent = (value: unknown): value is CharacterEvent =>
  normalizeCharacterEvent(value) !== undefined;

export const getCharacterEventIdempotencyKey = (event: Pick<CharacterEvent, keyof CharacterLifeEventKey>): string =>
  createCharacterLifeEventKey({ relationId: event.relationId, source: event.source, kind: event.kind });

/** Keeps the first event for a relation/source/kind key, making repeated writes safe. */
export function deduplicateCharacterEvents(events: readonly CharacterEvent[]): CharacterEvent[] {
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  return events.filter((event) => {
    const key = getCharacterEventIdempotencyKey(event);
    if (seenKeys.has(key) || seenIds.has(event.id)) return false;
    seenKeys.add(key);
    seenIds.add(event.id);
    return true;
  });
}

export function appendCharacterEvents(
  existing: readonly CharacterEvent[],
  incoming: readonly (CharacterEvent | CharacterEventInput)[],
  now = Date.now(),
): CharacterEvent[] {
  const normalized = incoming
    .map((event) => normalizeCharacterEvent(event, now))
    .filter((event): event is CharacterEvent => event !== undefined);
  return deduplicateCharacterEvents([...existing, ...normalized]);
}

export const removeCharacterEventsByRelations = (
  events: readonly CharacterEvent[],
  relationIds: readonly string[],
): CharacterEvent[] => {
  const removed = new Set(relationIds);
  return events.filter((event) => !removed.has(event.relationId));
};
