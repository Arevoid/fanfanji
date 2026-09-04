import type { Character } from "../../types";
import type { CharacterPhoneRecord } from "../../domain/characterPhone/types";

/** Temporary acceptance password until the persona-derived rule is finalized. */
export const CHARACTER_PHONE_HIDDEN_GALLERY_TEST_PASSCODE = "3737";

/**
 * Resolve the hidden-album password without exposing it to the content model.
 * A persisted per-phone override is intentionally supported so a future
 * persona/world-book password derivation can be introduced without changing
 * the UI gate or existing records.
 */
export function resolveCharacterPhoneHiddenGalleryPasscode(
  _character: Character,
  phone?: CharacterPhoneRecord | null,
): string {
  const configured = phone?.hiddenGalleryPasscode?.trim();
  if (configured && /^\d{4}$/.test(configured)) return configured;
  return CHARACTER_PHONE_HIDDEN_GALLERY_TEST_PASSCODE;
}
