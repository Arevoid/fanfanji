import type { Moment } from "../../../types";

/** Legacy moments are public. Character-phone private posts stay in that phone only. */
export function isMomentVisibleToUser(moment: Moment, ownerIdentityId: string): boolean {
  if ((moment.ownerIdentityId || "identity-1") !== ownerIdentityId) return false;
  if (moment.visibility === "private") return false;
  if (moment.visibility === "specific") {
    return Boolean(moment.visibilityTargetIds?.includes(ownerIdentityId) || moment.visibilityTargetIds?.includes("user"));
  }
  return true;
}

/** Relationship-network NPCs may only interact with explicitly public posts. */
export function isMomentPublic(moment: Moment): boolean {
  return (moment.visibility || "public") === "public";
}
