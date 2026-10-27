import type { Character, UserSettings } from "../../types";
import { resolveCharacterApiSettings } from "./characterApiSettings";

type Context = { settings: UserSettings; characters: readonly Character[] };
type TextRequest = { characterId?: string; apiKey?: string; apiEndpoint?: string; model?: string; apiTemperature?: number; streamCompatible?: boolean };
let context: (() => Context) | undefined;

/** App-owned live context; no storage, credentials or prompts are copied durably. */
export function installCharacterTextApiContext(read: () => Context) {
  context = read;
  return () => { if (context === read) context = undefined; };
}

export function routeCharacterTextRequest<T extends TextRequest>(request: T): T {
  if (!request.characterId || !context) return request;
  const current = context();
  const character = current.characters.find(item => item.id === request.characterId);
  if (!character) throw new Error("角色资料不可用，未发送模型请求。");
  const effective = resolveCharacterApiSettings(current.settings, character, current.characters);
  // Keep explicit task models/temperatures when this role inherits the global API.
  if (effective === current.settings) return request;
  return { ...request, apiKey: effective.apiKey, apiEndpoint: effective.apiEndpoint,
    model: effective.selectedModel, apiTemperature: effective.apiTemperature, streamCompatible: effective.streamCompatible };
}

/** Resolve before eligibility checks as well as at the actual transport boundary. */
export function resolveCharacterTextSettings<T>(settings: T, character?: Pick<Character, "id"> & Partial<Character>, characterId = character?.id): T {
  const current = context?.();
  const role = current?.characters.find(item => item.id === characterId) || character;
  if (!role) return settings;
  const global = current?.settings || settings as UserSettings;
  const effective = resolveCharacterApiSettings(global, role as Character, current?.characters || []);
  if (effective === global) return settings;
  return { ...settings, apiKey: effective.apiKey, apiEndpoint: effective.apiEndpoint,
    selectedModel: effective.selectedModel, apiTemperature: effective.apiTemperature, streamCompatible: effective.streamCompatible };
}
