import type { Moment, MomentVisibility } from "../../../types";

export interface MomentVisibilityViewer {
  /** Identity scope that owns the social feed being opened. */
  ownerIdentityId: string;
  /** Identity currently reading the post, when it differs from the owner scope. */
  identityId?: string;
  /** Character/phone identity currently reading the post. */
  characterId?: string;
}

/** Missing visibility is deliberately public for backwards compatibility. */
export function normalizeMomentVisibility(value: MomentVisibility | undefined): MomentVisibility {
  return value || "public";
}

/** The author always sees their own post; private posts never enter the shared feed. */
export function isMomentVisibleToViewer(moment: Moment, viewer: MomentVisibilityViewer): boolean {
  if ((moment.ownerIdentityId || "identity-1") !== viewer.ownerIdentityId) return false;
  const visibility = normalizeMomentVisibility(moment.visibility);
  // A user's own private post remains visible in their own feed. Character
  // phone private posts are mirrored for storage but stay inside that phone.
  if (visibility === "private") return !moment.characterId && !moment.relationshipNetworkNpcId;
  if (visibility === "user") return true;
  if (visibility === "specific") {
    const targets = new Set(moment.visibilityTargetIds || []);
    return targets.has(viewer.ownerIdentityId)
      || Boolean(viewer.identityId && targets.has(viewer.identityId))
      || Boolean(viewer.characterId && targets.has(viewer.characterId))
      || targets.has("user");
  }
  return true;
}

/** Main feed compatibility helper. Legacy callers pass the feed owner identity. */
export function isMomentVisibleToUser(moment: Moment, ownerIdentityId: string): boolean {
  return isMomentVisibleToViewer(moment, { ownerIdentityId });
}

/** Relationship-network NPCs may only interact with explicitly public posts. */
export function isMomentPublic(moment: Moment): boolean {
  return normalizeMomentVisibility(moment.visibility) === "public";
}

export function formatMomentVisibilityLabel(visibility: MomentVisibility | undefined): string {
  switch (normalizeMomentVisibility(visibility)) {
    case "private": return "私密";
    case "specific": return "特别的人";
    case "user": return "仅自己";
    default: return "公开";
  }
}
