import type { Character, MemoryItem, Message, OfflineStory } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { getOfflineStorySummaryMarker } from "../../../domain/memory/offlineMemorySync";
import { serializeMessageContentForPrompt } from "../../chat/prompts/messagePromptSerializer";

export function createOfflineGroupParticipantMemories(input: {
  story: OfflineStory;
  participants: readonly Character[];
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  activeIdentityId: string;
  sourceMessages: readonly Message[];
  userName: string;
  now: number;
}): MemoryItem[] {
  if (input.sourceMessages.length === 0) return [];
  const participantNames = input.participants.map((character) => character.remark || character.name).join("、");
  const transcript = input.sourceMessages.map((message) =>
    `${message.sender === "user" ? (input.userName || "用户") : "多人剧情"}：${serializeMessageContentForPrompt(message, { mode: "history", userName: input.userName })}`,
  ).filter((line) => !line.endsWith("：")).join("\n");
  if (!transcript) return [];
  const content = `【多人线下剧本：${input.story.title}】\n参与者：${input.userName || "用户"}、${participantNames}\n${transcript.slice(-12000)}\n[${getOfflineStorySummaryMarker(input.story)}]`;
  return input.participants.flatMap((participant) => {
    const relationship = findRelationshipForCanonicalCharacter(
      input.relationships,
      input.activeIdentityId,
      participant.id,
      input.characters,
    );
    if (!relationship) return [];
    return [{
      id: `offline-group-memory:${input.story.id}:${participant.id}`,
      characterId: participant.id,
      relationId: relationship.id,
      content,
      timestamp: input.now,
      importance: 4,
      isManual: false,
    } satisfies MemoryItem];
  });
}
