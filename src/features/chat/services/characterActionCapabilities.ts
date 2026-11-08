import type { CharacterActionDirective, CharacterActionType } from "./characterActionProtocol";

export type CharacterActionExecutionMode = "online_chat" | "offline_story";

export type CharacterActionCapabilityReason =
  | "allowed"
  | "unsupported_mode"
  | "actor_not_character"
  | "missing_payload"
  | "unsafe_payload";

export interface CharacterActionCapabilityResult {
  allowed: boolean;
  reason: CharacterActionCapabilityReason;
  /** Stable diagnostic code for logs/tests; never shown as model content. */
  code: string;
}

/**
 * Offline stories are local narrative documents, not a device control surface.
 * These actions can therefore be materialized as local story events without
 * contacting a device, provider, or external service.
 */
export const OFFLINE_STORY_LOCAL_ACTIONS: readonly CharacterActionType[] = [
  "send_sticker",
  "send_voice",
  "send_red_packet",
  "send_location",
  "send_file",
  "send_music",
  "send_transfer",
];

const OFFLINE_STORY_LOCAL_ACTION_SET = new Set<CharacterActionType>(OFFLINE_STORY_LOCAL_ACTIONS);

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.01 && value <= 10000;
}

/**
 * Evaluate the action at the feature boundary before any side effect or
 * persisted markup is created. This keeps online and offline callers on one
 * contract while allowing each scene to expose only the capabilities it owns.
 */
export function evaluateCharacterActionCapability(
  directive: CharacterActionDirective,
  mode: CharacterActionExecutionMode,
): CharacterActionCapabilityResult {
  if (directive.actor !== "character") {
    return { allowed: false, reason: "actor_not_character", code: "character_action_actor_mismatch" };
  }

  if (mode === "offline_story" && !OFFLINE_STORY_LOCAL_ACTION_SET.has(directive.type)) {
    return { allowed: false, reason: "unsupported_mode", code: `offline_action_unsupported:${directive.type}` };
  }

  if (directive.type === "send_red_packet" || directive.type === "send_transfer") {
    if (!hasValidAmount(directive.amount)) {
      return { allowed: false, reason: "missing_payload", code: "payment_amount_missing" };
    }
  }
  if (directive.type === "send_location" && !hasNonEmptyString(directive.location)) {
    return { allowed: false, reason: "missing_payload", code: "location_missing" };
  }
  if (directive.type === "send_file" && !hasNonEmptyString(directive.fileName)) {
    return { allowed: false, reason: "missing_payload", code: "file_name_missing" };
  }
  if (directive.type === "send_music" && !hasNonEmptyString(directive.musicTitle)) {
    return { allowed: false, reason: "missing_payload", code: "music_title_missing" };
  }
  if (directive.type === "send_sticker") {
    const hasStickerId = hasNonEmptyString(directive.stickerId);
    const hasStickerName = hasNonEmptyString(directive.stickerName);
    // Offline markup needs both fields to remain renderable without a
    // catalog lookup. Online execution can resolve either a known id or a
    // catalog name, but must never accept an empty sticker reference.
    if (mode === "offline_story" ? !hasStickerId || !hasStickerName : !hasStickerId && !hasStickerName) {
      return { allowed: false, reason: "missing_payload", code: "sticker_catalog_reference_missing" };
    }
  }
  if (directive.type === "send_voice" && !hasNonEmptyString(directive.contentHint)) {
    return { allowed: false, reason: "missing_payload", code: "voice_content_missing" };
  }

  return { allowed: true, reason: "allowed", code: "allowed" };
}
