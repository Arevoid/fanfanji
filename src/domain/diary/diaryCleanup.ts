import type { DiaryEntry, DiaryGenerationTask, DiaryShare, DiaryTranslation } from "../../types";

export const cleanupDiaryForRelations = (input: {
  relationIds: readonly string[];
  entries: readonly DiaryEntry[];
  shares: readonly DiaryShare[];
  tasks: readonly DiaryGenerationTask[];
  translations: readonly DiaryTranslation[];
}) => {
  const relationIds = new Set(input.relationIds);
  const removedEntryIds = new Set(input.entries.filter((entry) => entry.authorType === "character" && relationIds.has(entry.relationId || "")).map((entry) => entry.id));
  return {
    entries: input.entries.filter((entry) => !removedEntryIds.has(entry.id)),
    shares: input.shares.filter((share) => !relationIds.has(share.targetRelationId)),
    tasks: input.tasks.filter((task) => !relationIds.has(task.relationId)),
    translations: input.translations.filter((translation) => !removedEntryIds.has(translation.diaryEntryId)),
  };
};

export const cleanupDiaryForIdentity = <T extends { ownerIdentityId: string }>(records: readonly T[], ownerIdentityId: string): T[] =>
  records.filter((record) => record.ownerIdentityId !== ownerIdentityId);

