import type { Dispatch, SetStateAction } from "react";
import type { UserSettings } from "../../../types";

interface UseSettingsIdentityActionsOptions {
  settings: UserSettings;
  onSwitchIdentity?: (id: string) => void;
  onSaveSettings: (updater: (previous: UserSettings) => UserSettings) => boolean;
  setName: Dispatch<SetStateAction<string>>;
  setAvatar: Dispatch<SetStateAction<string>>;
  setSignature: Dispatch<SetStateAction<string>>;
  setBio: Dispatch<SetStateAction<string>>;
}

/** Owns identity switching while preserving the existing scoped save and callback behavior. */
export function useSettingsIdentityActions({
  settings, onSwitchIdentity, onSaveSettings, setName, setAvatar, setSignature, setBio,
}: UseSettingsIdentityActionsOptions) {
  const handleSwitchIdentity = (id: string) => {
    if (onSwitchIdentity) {
      onSwitchIdentity(id);
      return;
    }
    const identity = (settings.identities || []).find((item) => item.id === id);
    if (!identity) return;
    setName(identity.name);
    setAvatar(identity.avatar);
    setSignature(identity.signature);
    setBio(identity.bio);
    onSaveSettings((previous) => ({
      ...previous,
      activeIdentityId: id,
      name: identity.name,
      avatar: identity.avatar,
      signature: identity.signature,
      bio: identity.bio,
    }));
  };

  return { handleSwitchIdentity };
}
