import { useCallback } from "react";
import type { UserSettings, UserSettingsUpdate } from "../../../types";
import { findPrimaryIdentityForIdentity } from "../../../domain/relationship/characterRelationship";

interface UseSettingsScopedSaveOptions {
  onSaveSettings: (update: UserSettingsUpdate) => boolean;
}

/** Saves settings while keeping the selected主人设's profile fields in sync. */
export function useSettingsScopedSave({ onSaveSettings }: UseSettingsScopedSaveOptions) {
  const handleSave = useCallback((updatedFields: Partial<UserSettings>): boolean => {
    return onSaveSettings((previous: UserSettings) => {
      const activeIdentityId = previous.activeIdentityId || "identity-1";
      const profileIdentity = findPrimaryIdentityForIdentity(activeIdentityId, previous.identities || [])
        || previous.identities?.find((identity) => identity.id === activeIdentityId);
      const updatedIdentities = (previous.identities || []).map((identity) => {
        if (!profileIdentity || identity.id !== profileIdentity.id) return identity;
        return {
          ...identity,
          name: updatedFields.name !== undefined ? updatedFields.name : identity.name,
          avatar: updatedFields.avatar !== undefined ? updatedFields.avatar : identity.avatar,
          signature: updatedFields.signature !== undefined ? updatedFields.signature : identity.signature,
          bio: updatedFields.bio !== undefined ? updatedFields.bio : identity.bio,
        };
      });

      return { ...previous, ...updatedFields, identities: updatedIdentities };
    });
  }, [onSaveSettings]);

  return { handleSave };
}
