import type { Character, ImageGenerationRecord, UserSettings } from "../../../types";

export const PROACTIVE_IMAGE_COOLDOWN_MS = 30 * 60 * 1000;
export const PROACTIVE_IMAGE_DAILY_LIMIT = 3;

export type ProactiveImageGenerationBlockReason =
  | "global-disabled"
  | "character-disabled"
  | "missing-relation"
  | "cooldown"
  | "daily-limit";

export function isProactiveImageGenerationEnabled(settings: Pick<UserSettings, "enableImageGeneration" | "enableProactiveImageGeneration">, character: Pick<Character, "enableImageGeneration" | "enableProactiveImageGeneration">): boolean {
  return settings.enableImageGeneration === true
    && settings.enableProactiveImageGeneration === true
    && character.enableImageGeneration === true
    && character.enableProactiveImageGeneration === true;
}

export function checkProactiveImageGenerationPolicy(input: {
  settings: Pick<UserSettings, "enableImageGeneration" | "enableProactiveImageGeneration">;
  character: Pick<Character, "enableImageGeneration" | "enableProactiveImageGeneration">;
  records: readonly ImageGenerationRecord[];
  relationId?: string;
  now?: number;
  cooldownMs?: number;
  dailyLimit?: number;
}): { allowed: true } | { allowed: false; reason: ProactiveImageGenerationBlockReason } {
  if (input.settings.enableImageGeneration !== true || input.settings.enableProactiveImageGeneration !== true) {
    return { allowed: false, reason: "global-disabled" };
  }
  if (input.character.enableImageGeneration !== true || input.character.enableProactiveImageGeneration !== true) {
    return { allowed: false, reason: "character-disabled" };
  }
  if (!input.relationId) return { allowed: false, reason: "missing-relation" };

  const now = input.now ?? Date.now();
  const cooldownMs = input.cooldownMs ?? PROACTIVE_IMAGE_COOLDOWN_MS;
  const dailyLimit = input.dailyLimit ?? PROACTIVE_IMAGE_DAILY_LIMIT;
  const scoped = input.records
    .filter((record) => record.relationId === input.relationId && record.trigger === "character-action")
    .sort((left, right) => right.createdAt - left.createdAt);
  if (scoped[0] && now - scoped[0].createdAt < cooldownMs) return { allowed: false, reason: "cooldown" };
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  if (scoped.filter((record) => record.createdAt >= dayStart.getTime()).length >= dailyLimit) {
    return { allowed: false, reason: "daily-limit" };
  }
  return { allowed: true };
}

