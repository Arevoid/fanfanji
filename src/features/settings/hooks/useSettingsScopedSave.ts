import { useCallback } from "react";
import type { UserSettings, UserSettingsUpdate } from "../../../types";
import { updateIdentityProfile } from "../../../domain/identity/identityProfile";

interface UseSettingsScopedSaveOptions {
  onSaveSettings: (update: UserSettingsUpdate) => boolean;
  onSaveSettingsAsync?: (update: UserSettingsUpdate) => Promise<boolean>;
}

/** Saves settings while keeping the selected主人设's profile fields in sync. */
export function useSettingsScopedSave({ onSaveSettings, onSaveSettingsAsync }: UseSettingsScopedSaveOptions) {
  const createUpdate = useCallback((updatedFields: Partial<UserSettings>) => (previous: UserSettings) => {
    const activeIdentityId = previous.activeIdentityId || "identity-1";
    const next = { ...previous, ...updatedFields };
    return updateIdentityProfile(next, activeIdentityId, {
      ...(updatedFields.name !== undefined ? { name: updatedFields.name } : {}),
      ...(updatedFields.avatar !== undefined ? { avatar: updatedFields.avatar } : {}),
      ...(updatedFields.signature !== undefined ? { signature: updatedFields.signature } : {}),
      ...(updatedFields.bio !== undefined ? { bio: updatedFields.bio } : {}),
    });
  }, []);

  const handleSave = useCallback((updatedFields: Partial<UserSettings>): boolean => {
    return onSaveSettings(createUpdate(updatedFields));
  }, [createUpdate, onSaveSettings]);

  const handleSaveAsync = useCallback((updatedFields: Partial<UserSettings>): Promise<boolean> => {
    if (!onSaveSettingsAsync) return Promise.resolve(handleSave(updatedFields));
    return onSaveSettingsAsync(createUpdate(updatedFields));
  }, [createUpdate, handleSave, onSaveSettingsAsync]);

  return { handleSave, handleSaveAsync };
}
