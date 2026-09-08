import { useState } from "react";
import type { UserSettings } from "../../../types";

export function useSettingsProfileDraftState(settings: UserSettings) {
  const [name, setName] = useState(settings.name);
  const [avatar, setAvatar] = useState(settings.avatar);
  const [signature, setSignature] = useState(settings.signature);
  const [bio, setBio] = useState(settings.bio);

  return { name, setName, avatar, setAvatar, signature, setSignature, bio, setBio };
}
