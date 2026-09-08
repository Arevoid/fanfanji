import type { ScheduleScope } from "./scheduleTypes";

export const isNonEmptyScheduleId = (value: unknown): value is string =>
  typeof value === "string" && Boolean(value.trim());

export const isCompleteScheduleScope = <T extends Partial<ScheduleScope>>(
  value: T | undefined,
): value is T & ScheduleScope =>
  Boolean(value
    && isNonEmptyScheduleId(value.relationId)
    && isNonEmptyScheduleId(value.characterId)
    && isNonEmptyScheduleId(value.userIdentityId));

export const isSameScheduleScope = (left: ScheduleScope, right: ScheduleScope): boolean =>
  left.relationId === right.relationId
  && left.characterId === right.characterId
  && left.userIdentityId === right.userIdentityId;

export const listByScheduleScope = <T extends ScheduleScope>(items: readonly T[], scope: ScheduleScope): T[] =>
  items.filter((item) => isSameScheduleScope(item, scope));
