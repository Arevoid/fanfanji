import type { Character, MemoryItem, Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";

export function createGroupTurnMemories(input: {
  group: Character;
  members: readonly Character[];
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  activeIdentityId: string;
  userName: string;
  userMessage: Message | null;
  replies: readonly Message[];
  timestamp: number;
}): MemoryItem[] {
  const publicLines: string[] = [];
  if (input.userMessage?.content.trim()) {
    publicLines.push(`${input.userName || "用户"}：${input.userMessage.content.trim()}`);
  }
  input.replies.forEach((reply) => {
    if (!reply.content.trim() || reply.isNarration) return;
    const sender = input.members.find((member) => member.id === reply.senderId);
    if (!sender) return;
    publicLines.push(`${sender.remark || sender.name}：${reply.content.trim()}`);
  });
  if (publicLines.length === 0) return [];

  const turnKey = input.userMessage?.id || input.replies[0]?.id || String(input.timestamp);
  const content = `【群聊公开记录：${input.group.name}】\n${publicLines.join("\n")}`;
  return input.members.flatMap((member) => {
    const relationship = findRelationshipForCanonicalCharacter(
      input.relationships,
      input.activeIdentityId,
      member.id,
      input.characters,
    );
    if (!relationship) return [];
    return [{
      id: `group-memory:${input.group.id}:${turnKey}:${member.id}`,
      characterId: member.id,
      relationId: relationship.id,
      content,
      timestamp: input.timestamp,
      importance: 3,
      isManual: false,
    } satisfies MemoryItem];
  });
}
