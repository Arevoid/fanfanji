import { useCallback } from "react";
import type { UserSettings, UserSettingsUpdate } from "../../../types";
import { updateIdentityProfile } from "../../../domain/identity/identityProfile";

interface UseSettingsScopedSaveOptions {
  onSaveSettings: (update: UserSettingsUpdate) => boolean;
}

/** Saves settings while keeping the selected主人设's profile fields in sync. */
export function useSettingsScopedSave({ onSaveSettings }: UseSettingsScopedSaveOptions) {
  const handleSave = useCallback((updatedFields: Partial<UserSettings>): boolean => {
    return onSaveSettings((previous: UserSettings) => {
      const activeIdentityId = previous.activeIdentityId || "identity-1";
      const next = { ...previous, ...updatedFields };
      return updateIdentityProfile(next, activeIdentityId, {
        ...(updatedFields.name !== undefined ? { name: updatedFields.name } : {}),
        ...(updatedFields.avatar !== undefined ? { avatar: updatedFields.avatar } : {}),
        ...(updatedFields.signature !== undefined ? { signature: updatedFields.signature } : {}),
        ...(updatedFields.bio !== undefined ? { bio: updatedFields.bio } : {}),
      });
    });
  }, [onSaveSettings]);

  return { handleSave };
}
