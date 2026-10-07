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

/**
 * The owner sees every visibility state on their own Moments feed. Character
 * posts keep their audience rules: private posts stay inside the character
 * phone, while public/user-only posts may appear in the owner's feed.
 */
export function isMomentVisibleToViewer(moment: Moment, viewer: MomentVisibilityViewer): boolean {
  if ((moment.ownerIdentityId || "identity-1") !== viewer.ownerIdentityId) return false;
  const isUserAuthored = !moment.characterId && !moment.relationshipNetworkNpcId;
  const isOwnerFeed = !viewer.characterId && !viewer.identityId;
  if (isUserAuthored && isOwnerFeed) return true;
  const visibility = normalizeMomentVisibility(moment.visibility);
  // Character-phone private posts are mirrored into the shared store for
  // synchronization, but they remain visible only inside that character's
  // phone. `user` is the character's "对我可见" state.
  if (visibility === "private") return false;
  // `user` means "对我可见": it is readable by the owner feed, not by a
  // different character reading the owner's social feed.
  if (visibility === "user") return !viewer.characterId;
  if (visibility === "specific") {
    const targets = new Set(moment.visibilityTargetIds || []);
    return targets.has(viewer.ownerIdentityId)
      || Boolean(viewer.identityId && targets.has(viewer.identityId))
      || Boolean(viewer.characterId && targets.has(viewer.characterId))
      || (targets.has("user") && !viewer.characterId);
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
