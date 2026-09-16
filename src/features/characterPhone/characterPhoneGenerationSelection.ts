import {
  CHARACTER_PHONE_GENERATABLE_APPS,
  type CharacterPhoneGeneratedAppId,
} from "../../domain/characterPhone/types";

export type CharacterPhoneGenerationSelection =
  | { mode: "all" }
  | { mode: "selected"; appIds: CharacterPhoneGeneratedAppId[] };

export const DEFAULT_CHARACTER_PHONE_GENERATION_SELECTION: CharacterPhoneGenerationSelection = { mode: "all" };

export function toggleCharacterPhoneGenerationApp(
  selection: CharacterPhoneGenerationSelection,
  appId: CharacterPhoneGeneratedAppId,
): CharacterPhoneGenerationSelection {
  const selected = selection.mode === "all" ? [] : selection.appIds;
  const next = selected.includes(appId)
    ? selected.filter((candidate) => candidate !== appId)
    : [...selected, appId];
  const order = new Map(CHARACTER_PHONE_GENERATABLE_APPS.map((app, index) => [app.id, index]));
  next.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  return { mode: "selected", appIds: next };
}

export function resolveCharacterPhoneGenerationApps(
  selection: CharacterPhoneGenerationSelection,
): CharacterPhoneGeneratedAppId[] {
  return selection.mode === "all"
    ? CHARACTER_PHONE_GENERATABLE_APPS.map((app) => app.id)
    : [...selection.appIds];
}
