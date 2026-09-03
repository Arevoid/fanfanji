import { createId } from "../../id/createId";
import { readArray, writeArray } from "./repositoryUtils";
import { storageKeys } from "../storageKeys";
import type { Character } from "../../../types";
import type { CharacterPhoneRecord } from "../../../domain/characterPhone/types";

const load = () =>
  readArray<CharacterPhoneRecord>(storageKeys.characterPhones, []);

export const CHARACTER_PHONE_DEFAULT_WALLPAPER =
  "linear-gradient(145deg, #eeeeec 0%, #fafaf9 48%, #e4e4e2 100%)";

export function normalizeCharacterPhonePasscode(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.padStart(4, "0").slice(-4);
}

const passcodeFor = (character: Character) => {
  void character;
  return "0000";
};

export function getCharacterPhone(
  ownerIdentityId: string,
  characterId: string,
): CharacterPhoneRecord | undefined {
  return load().value.find(
    (phone) =>
      phone.ownerIdentityId === ownerIdentityId &&
      phone.characterId === characterId,
  );
}

export function createCharacterPhone(
  ownerIdentityId: string,
  character: Character,
  now = Date.now(),
): CharacterPhoneRecord {
  const existing = getCharacterPhone(ownerIdentityId, character.id);
  if (existing) return existing;
  const phone: CharacterPhoneRecord = {
    id: createId("character-phone"),
    ownerIdentityId,
    characterId: character.id,
    passcode: normalizeCharacterPhonePasscode(passcodeFor(character)),
    failedAttempts: 0,
    createdAt: now,
    updatedAt: now,
    wallpaper: CHARACTER_PHONE_DEFAULT_WALLPAPER,
    appIcons: {},
    appOrder: ["chat", "browser", "schedule", "gallery", "diary", "notes", "music", "settings"],
    // A new role phone starts empty. Its visible contacts and conversations
    // are seeded by characterPhoneContent from this character's own context;
    // hard-coded demo messages here would leak across characters.
    messages: [],
    contacts: [],
    threadMessages: [],
    posts: [],
    browserHistory: [],
    diaryEntries: [],
    notes: [],
    todos: [],
    scheduleItems: [],
    galleryItems: [],
    activities: [],
  };
  saveCharacterPhone(phone);
  return phone;
}

export function saveCharacterPhone(phone: CharacterPhoneRecord) {
  const current = load().value;
  return writeArray(storageKeys.characterPhones, [
    ...current.filter((item) => item.id !== phone.id),
    phone,
  ]);
}
