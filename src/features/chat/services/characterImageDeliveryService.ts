import type { Character, Message, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { imageAssetDb } from "../../../utils/imageAssetDb";
import { generateCharacterImage, resolveCharacterImageContext } from "./characterImageService";

export type CharacterImageDeliveryResult =
  | { status: "missing-context" }
  | { status: "stale" }
  | { status: "generated"; message: Message; record: Awaited<ReturnType<typeof generateCharacterImage>>["record"] };

/** Owns image-generation context capture and the stale-relation cleanup boundary. */
export async function generateCharacterImageForDelivery(input: {
  activeCharacter?: Character;
  activeRelationship?: CharacterRelationship;
  currentMessages: readonly Message[];
  characters: readonly Character[];
  settings: UserSettings;
  trigger: "manual" | "explicit-user-text";
  userText: string;
  createId: () => string;
  isRuntimeCurrent: () => boolean;
}): Promise<CharacterImageDeliveryResult> {
  if (!input.activeCharacter) return { status: "missing-context" };
  const imageContext = resolveCharacterImageContext({
    activeCharacter: input.activeCharacter,
    activeRelationship: input.activeRelationship,
    currentMessages: input.currentMessages,
    characters: input.characters,
  });
  if (!imageContext) return { status: "missing-context" };

  const generated = await generateCharacterImage({
    settings: input.settings,
    character: imageContext.character,
    relationship: imageContext.relationship,
    recentMessages: imageContext.recentMessages,
    scope: imageContext.scope,
    trigger: input.trigger,
    userText: input.userText,
    createId: input.createId,
  });
  if (input.isRuntimeCurrent()) return { status: "generated", ...generated };
  await imageAssetDb.deleteImage(generated.record.imageAssetId).catch(() => undefined);
  return { status: "stale" };
}
