/** Explicit simulation intervals; unknown time/location stays unknown. */
export interface LifeScheduleSlot { startAt: number; endAt: number; location?: string }
export function isLifeScheduleSlot(raw: unknown): raw is LifeScheduleSlot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = raw as LifeScheduleSlot;
  return Number.isFinite(value.startAt) && Number.isFinite(value.endAt) && value.startAt >= 0
    && value.endAt > value.startAt && value.endAt - value.startAt <= 6 * 60 * 60_000
    && (value.location === undefined || typeof value.location === "string" && value.location.trim().length > 0 && value.location.length <= 120);
}
interface ScheduledLife {
  id: string; characterId: string; userIdentityId: string; status: string; supersededById?: string; scheduleSlot?: LifeScheduleSlot;
}
export function canScheduleLife(candidate: ScheduledLife, existing: readonly ScheduledLife[], replacingId?: string): boolean {
  if (!candidate.scheduleSlot || candidate.status === "cancelled") return true;
  if (!isLifeScheduleSlot(candidate.scheduleSlot)) return false;
  return !existing.some(record => record.id !== candidate.id && record.id !== replacingId
    && record.characterId === candidate.characterId && record.userIdentityId === candidate.userIdentityId
    && !record.supersededById && record.status !== "cancelled" && record.scheduleSlot
    && record.scheduleSlot.startAt < candidate.scheduleSlot!.endAt && candidate.scheduleSlot!.startAt < record.scheduleSlot.endAt);
}
