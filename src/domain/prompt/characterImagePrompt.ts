import type { Character, Message } from "../../types";
import type { CharacterRelationship } from "../relationship/characterRelationship";
import { serializeMessageContentForPrompt } from "../../features/chat/prompts/messagePromptSerializer";

export function buildCharacterImagePrompt(input: {
  character: Character;
  relationship?: CharacterRelationship;
  recentMessages: readonly Message[];
  userRequest: string;
}): string {
  const recent = input.recentMessages.slice(-8).map((message) => `${message.sender === "user" ? "用户" : input.character.name}: ${serializeMessageContentForPrompt(message, { mode: "history", characterName: input.character.name })}`).join("\n");
  return [
    `Create one natural in-character photo of ${input.character.name}.`,
    `Canonical appearance and style: ${input.character.imageAppearancePrompt?.trim() || "Use the character's established profile, appearance and temperament."}`,
    input.character.imageNegativePrompt?.trim() ? `Avoid: ${input.character.imageNegativePrompt.trim()}` : "",
    input.relationship ? `Current relationship context only: ${input.relationship.relationship}.` : "Current group-chat context only.",
    `Recent scoped conversation:\n${recent || "(none)"}`,
    `The user explicitly requested: ${input.userRequest.trim()}`,
    "Do not include text, watermarks, UI, labels, or unrelated people unless requested.",
  ].filter(Boolean).join("\n\n");
}
