import type { Character } from "../../types";
import type { CharacterPhoneRecord } from "../../domain/characterPhone/types";

/**
 * Resolve the hidden-album password without a global fallback. New phones get
 * a role-specific hidden secret at creation time; older records fall back to
 * their already-persisted role-phone secret so existing users are not locked
 * out or mixed with another role.
 */
export function resolveCharacterPhoneHiddenGalleryPasscode(
  _character: Character,
  phone?: CharacterPhoneRecord | null,
): string {
  const configured = phone?.hiddenGalleryPasscode?.trim();
  if (configured && /^\d{4}$/.test(configured)) return configured;
  const digits = phone?.passcode ? String(phone.passcode).replace(/\D/g, "") : "";
  return digits ? digits.padStart(4, "0").slice(-4) : "";
}
