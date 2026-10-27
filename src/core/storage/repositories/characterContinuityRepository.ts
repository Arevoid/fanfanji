import { emptyCharacterContinuity, type CharacterContinuityStore } from "../../../domain/memory/characterContinuity";
import { readJson, writeJson } from "../storageAdapter";
import { normalizeImpressionGrowth } from "../../../domain/memory/impressionGrowth";
import { isCharacterLifeActivity } from "../../../domain/memory/characterLifeActivity";
import { isContinuousLifeState } from "../../../domain/memory/continuousLifeState";
import { isLifeScheduleSlot } from "../../../domain/memory/lifeSchedulePolicy";
export const CHARACTER_CONTINUITY_KEY = "phone_character_memory_continuity_v1";
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 8.64e15;
const scope = (value: unknown) => object(value) && ["characterId", "relationId", "userIdentityId", "conversationId"].every((key) => text(value[key]));
const strings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");
const validGrowth = (value: unknown) => {
  if (!object(value)) return false;
  const normalized = normalizeImpressionGrowth(value);
  return Boolean(normalized) && Object.keys(value).length === Object.keys(normalized!).length
    && Object.entries(value).every(([key, amount]) => (normalized as Record<string, unknown>)[key] === amount);
};
export function isCharacterContinuityStore(value: unknown): value is CharacterContinuityStore {
  return object(value) && value.version === 1 && Number.isInteger(value.revision) && (value.revision as number) >= 0
    && (value.suppressedImpressions === undefined || Array.isArray(value.suppressedImpressions) && value.suppressedImpressions.every((item) => object(item)
      && scope(item.scope) && strings(item.sourceClaimIds) && finite(item.deletedAt)))
    && (value.lifeStates === undefined || Array.isArray(value.lifeStates) && value.lifeStates.every(isContinuousLifeState))
    && (value.lifeWitnesses === undefined || Array.isArray(value.lifeWitnesses) && value.lifeWitnesses.every((item) => object(item)
      && ["npcId", "ownerCharacterId", "userIdentityId", "sourceEpisodeId"].every((key) => text(item[key])) && finite(item.acquiredAt)))
    && Array.isArray(value.impressions) && value.impressions.every((item) => object(item) && text(item.id) && scope(item.scope)
      && text(item.category) && text(item.proposition) && finite(item.confidence) && (item.confidence as number) >= 0 && (item.confidence as number) <= 1
      && (item.themeKey === undefined || text(item.themeKey))
      && (item.opposingClaimIds === undefined || strings(item.opposingClaimIds) && strings(item.sourceClaimIds)
        && (item.opposingClaimIds as string[]).every((ref) => (item.sourceClaimIds as string[]).includes(ref)))
      && (item.growth === undefined || validGrowth(item.growth))
      && (item.themeReferenceId === undefined || text(item.themeReferenceId))
      && (item.resolvedById === undefined || text(item.resolvedById))
      && (item.revisionReason === undefined || text(item.revisionReason))
      && (item.revisionMode === undefined || ["reinforce", "revise", "oppose"].includes(String(item.revisionMode)))
      && strings(item.sourceClaimIds) && finite(item.recordedAt) && ["active", "superseded", "invalid", "candidate"].includes(item.status as string))
    && Array.isArray(value.life) && value.life.every((item) => object(item) && text(item.id) && text(item.characterId) && text(item.userIdentityId)
      && (item.publicSharing === undefined || object(item.publicSharing) && text(item.publicSharing.revision) && finite(item.publicSharing.approvedAt))
      && (item.intervention === undefined || typeof item.intervention === "boolean")
      && (item.summaryHistory === undefined || Array.isArray(item.summaryHistory) && item.summaryHistory.every((entry) => object(entry) && text(entry.text) && finite(entry.editedAt)))
      && text(item.summary) && finite(item.occurredAt) && finite(item.recordedAt) && item.private === true && item.origin === "foreground_simulation"
      && (item.participantIds === undefined || strings(item.participantIds))
      && (item.activity === undefined || isCharacterLifeActivity(item.activity))
      && (item.scheduleSlot === undefined || isLifeScheduleSlot(item.scheduleSlot))
      && (item.previousEpisodeId === undefined || text(item.previousEpisodeId)) && (item.supersededById === undefined || text(item.supersededById))
      && ["completed", "planned", "cancelled"].includes(item.status as string))
    && Array.isArray(value.tasks) && value.tasks.every((item) => object(item) && text(item.id) && scope(item.scope) && text(item.day)
      && finite(item.startedAt) && Number.isInteger(item.attempts) && (item.attempts as number) > 0 && ["running", "completed", "failed"].includes(item.status as string))
    && Array.isArray(value.forgotten) && value.forgotten.every((item) => object(item) && scope(item.scope) && text(item.statement) && strings(item.sourceIds)
      && (item.claimId === undefined || text(item.claimId)) && (item.forgottenAt === undefined || finite(item.forgottenAt))
      && (item.sourceRecordId === undefined || text(item.sourceRecordId)) && (item.organizationSourceId === undefined || text(item.organizationSourceId)));
}
export function loadCharacterContinuity() {
  const read = readJson<CharacterContinuityStore>(CHARACTER_CONTINUITY_KEY, emptyCharacterContinuity());
  const value = read.value;
  const valid = read.valid && isCharacterContinuityStore(value);
  return { ...read, valid, value: valid ? value : emptyCharacterContinuity() };
}
export function updateCharacterContinuity(update: (store: CharacterContinuityStore) => CharacterContinuityStore, expectedRevision?: number) {
  const current = loadCharacterContinuity();
  if (!current.valid) return { success: false, error: "validation" as const };
  if (expectedRevision !== undefined && current.value.revision !== expectedRevision) return { success: false, error: "verification" as const };
  const next = update(structuredClone(current.value));
  if (!isCharacterContinuityStore(next)) return { success: false, error: "validation" as const };
  return writeJson(CHARACTER_CONTINUITY_KEY, { ...next, revision: current.value.revision + 1 });
}
