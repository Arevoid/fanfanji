import type { CharacterPhoneGeneratedAppId, CharacterPhoneRecord } from "../../domain/characterPhone/types";

export const CHARACTER_PHONE_GENERATION_COOLDOWN_MS = 3 * 60 * 60 * 1000;

export interface CharacterPhoneGenerationCooldown {
  appId: CharacterPhoneGeneratedAppId;
  until: number;
}

export function getCharacterPhoneGenerationCooldowns(
  phone: Pick<CharacterPhoneRecord, "generationCooldowns">,
  appIds: readonly CharacterPhoneGeneratedAppId[],
  now = Date.now(),
): CharacterPhoneGenerationCooldown[] {
  const seen = new Set<CharacterPhoneGeneratedAppId>();
  return appIds.flatMap((appId) => {
    if (seen.has(appId)) return [];
    seen.add(appId);
    const until = phone.generationCooldowns?.[appId];
    return typeof until === "number" && Number.isFinite(until) && until > now ? [{ appId, until }] : [];
  });
}

export function recordCharacterPhoneGenerationCooldowns<T extends CharacterPhoneRecord>(
  phone: T,
  appIds: readonly CharacterPhoneGeneratedAppId[],
  generatedAt: number,
): T {
  const generationCooldowns: NonNullable<CharacterPhoneRecord["generationCooldowns"]> = {
    ...phone.generationCooldowns,
  };
  for (const appId of new Set(appIds)) {
    generationCooldowns[appId] = generatedAt + CHARACTER_PHONE_GENERATION_COOLDOWN_MS;
  }
  return { ...phone, generationCooldowns };
}

export function formatCharacterPhoneCooldownRemaining(until: number, now = Date.now()): string {
  const remainingMinutes = Math.max(1, Math.ceil((until - now) / 60_000));
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return hours > 0 ? `${hours}小时${minutes > 0 ? `${minutes}分钟` : ""}` : `${minutes}分钟`;
}
