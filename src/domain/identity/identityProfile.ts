import type { UserIdentity, UserSettings } from "../../types";
import { findPrimaryIdentityForIdentity } from "../relationship/characterRelationship";

export type IdentityProfilePatch = Partial<Pick<UserIdentity, "name" | "avatar" | "signature" | "bio">>;

/**
 * Applies profile edits to the persisted identity record and keeps the
 * legacy top-level profile projection synchronized with its owning primary.
 * Alias edits never overwrite the alias owner's display profile.
 */
export function updateIdentityProfile(
  settings: UserSettings,
  identityId: string | undefined,
  patch: IdentityProfilePatch,
): UserSettings {
  const identities = settings.identities || [];
  const target = identityId ? identities.find((identity) => identity.id === identityId) : undefined;
  const primary = target
    ? findPrimaryIdentityForIdentity(target.id, identities) || (target.kind === "primary" ? target : undefined)
    : undefined;
  const updatedIdentities = target
    ? identities.map((identity) => identity.id === target.id ? { ...identity, ...patch } : identity)
    : identities;
  const updatedPrimary = primary
    ? updatedIdentities.find((identity) => identity.id === primary.id) || primary
    : undefined;

  return {
    ...settings,
    identities: updatedIdentities,
    ...(updatedPrimary
      ? {
        name: updatedPrimary.name,
        avatar: updatedPrimary.avatar,
        signature: updatedPrimary.signature,
        bio: updatedPrimary.bio,
      }
      : patch),
  };
}
