import type { CharacterRelationship } from "../relationship/characterRelationship";

/** Proactive offline invitations are opt-in and scoped to one relationship. */
export const isProactiveOfflineEnabled = (
  relationship: Pick<CharacterRelationship, "enableProactiveOffline"> | undefined,
): boolean => relationship?.enableProactiveOffline === true;

/** Omits the disabled value so existing relationship records stay backwards compatible. */
export const createProactiveOfflinePreferencePatch = (
  enabled: boolean,
): Pick<CharacterRelationship, "enableProactiveOffline"> => ({
  enableProactiveOffline: enabled || undefined,
});
