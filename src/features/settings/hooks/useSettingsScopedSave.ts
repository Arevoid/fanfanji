import { useCallback } from "react";
import type { UserSettings, UserSettingsUpdate } from "../../../types";

interface UseSettingsScopedSaveOptions {
  onSaveSettings: (update: UserSettingsUpdate) => boolean;
}

/** Saves settings while keeping the active identity's profile fields in sync. */
export function useSettingsScopedSave({ onSaveSettings }: UseSettingsScopedSaveOptions) {
  const handleSave = useCallback((updatedFields: Partial<UserSettings>): boolean => {
    return onSaveSettings((previous: UserSettings) => {
      const activeIdentityId = previous.activeIdentityId || "identity-1";
      const updatedIdentities = (previous.identities || []).map((identity) => {
        if (identity.id !== activeIdentityId) return identity;
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
