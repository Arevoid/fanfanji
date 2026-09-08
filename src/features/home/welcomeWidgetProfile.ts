import type { UserIdentity } from "../../types";
import { readString, writeString } from "../../core/storage/storageAdapter";

export const WELCOME_WIDGET_ID = "welcome_widget_1";
export const WELCOME_WIDGET_DEFAULT_NAME = "欢迎";
export const WELCOME_WIDGET_DEFAULT_SIGNATURE = "今天也要好好生活";

export interface WelcomeWidgetProfile {
  avatar: string;
  name: string;
  signature: string;
}

type LegacyWelcomeProfile = Pick<UserIdentity, "avatar" | "name" | "signature">;

/**
 * Reads the desktop-only welcome profile. The optional identity is a one-time
 * migration fallback for users who already had the old identity-bound card.
 */
export function loadWelcomeWidgetProfile(id: string = WELCOME_WIDGET_ID, legacyProfile?: LegacyWelcomeProfile): WelcomeWidgetProfile {
  return {
    avatar: readString(`welcome_widget_avatar_${id}`).value ?? legacyProfile?.avatar ?? "",
    name: readString(`welcome_widget_name_${id}`).value ?? legacyProfile?.name ?? WELCOME_WIDGET_DEFAULT_NAME,
    signature: readString(`welcome_widget_signature_${id}`).value ?? legacyProfile?.signature ?? WELCOME_WIDGET_DEFAULT_SIGNATURE,
  };
}

export function normalizeWelcomeWidgetProfile(profile: Partial<WelcomeWidgetProfile>): WelcomeWidgetProfile {
  return {
    avatar: typeof profile.avatar === "string" ? profile.avatar : "",
    name: profile.name?.trim() || WELCOME_WIDGET_DEFAULT_NAME,
    signature: profile.signature?.trim() || WELCOME_WIDGET_DEFAULT_SIGNATURE,
  };
}

export function saveWelcomeWidgetProfile(id: string, profile: Partial<WelcomeWidgetProfile>): WelcomeWidgetProfile {
  const normalized = normalizeWelcomeWidgetProfile(profile);
  writeString(`welcome_widget_avatar_${id}`, normalized.avatar);
  writeString(`welcome_widget_name_${id}`, normalized.name);
  writeString(`welcome_widget_signature_${id}`, normalized.signature);
  return normalized;
}

/** Materializes a legacy fallback without overwriting an existing field. */
export function ensureWelcomeWidgetProfile(id: string, profile: WelcomeWidgetProfile): void {
  const normalized = normalizeWelcomeWidgetProfile(profile);
  const fields: Array<[string, string]> = [
    [`welcome_widget_avatar_${id}`, normalized.avatar],
    [`welcome_widget_name_${id}`, normalized.name],
    [`welcome_widget_signature_${id}`, normalized.signature],
  ];
  fields.forEach(([key, value]) => {
    if (!readString(key).found) writeString(key, value);
  });
}
