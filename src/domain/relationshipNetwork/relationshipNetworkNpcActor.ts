import type { Character } from "../../types";
import type { CharacterRelationship } from "../relationship/characterRelationship";
import {
  createRelationship,
  findRelationshipForCanonicalCharacter,
} from "../relationship/characterRelationship";
import type { RelationshipNetworkNpc } from "./relationshipNetworkTypes";

/**
 * A relationship-network NPC is already an independent person. These stable
 * fallback IDs let a lightweight NPC participate in AI interactions without
 * first creating a full chat profile or a visible chat relationship.
 */
export const getRelationshipNetworkNpcActorCharacterId = (npcId: string): string =>
  `relationship-network-npc-actor:${npcId}`;

export const getRelationshipNetworkNpcActorRelationId = (npcId: string): string =>
  `relationship-network-npc-relation:${npcId}`;

export function createRelationshipNetworkNpcActorCharacter(
  npc: RelationshipNetworkNpc,
  ownerIdentityId: string,
): Character {
  return {
    id: getRelationshipNetworkNpcActorCharacterId(npc.id),
    name: npc.name,
    avatar: npc.avatar || "👤",
    personality: npc.personality || npc.summary || "一个关系网中的 NPC。",
    backstory: [
      `【关系网 NPC 档案】${npc.name}`,
      npc.summary ? `人物简介：${npc.summary}` : "",
      npc.role ? `身份/职业：${npc.role}` : "",
      npc.motivation ? `当前动机：${npc.motivation}` : "",
      npc.tags?.length ? `标签：${npc.tags.join("、")}` : "",
    ].filter(Boolean).join("\n\n"),
    remark: npc.role || "关系网 NPC",
    ownerIdentityId,
    relationshipNetworkNpcId: npc.id,
  };
}

export interface RelationshipNetworkNpcActor {
  character: Character;
  relationship: CharacterRelationship;
  isPromoted: boolean;
}

export function resolveRelationshipNetworkNpcActor(input: {
  npc: RelationshipNetworkNpc;
  ownerIdentityId: string;
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  preferredCharacterId?: string;
  preferredRelationId?: string;
}): RelationshipNetworkNpcActor {
  const character = input.characters.find((candidate) =>
    (candidate.ownerIdentityId || "identity-1") === input.ownerIdentityId
    && ((input.preferredCharacterId && candidate.id === input.preferredCharacterId)
      || candidate.relationshipNetworkNpcId === input.npc.id),
  ) || createRelationshipNetworkNpcActorCharacter(input.npc, input.ownerIdentityId);

  const relationship = input.relationships.find((candidate) =>
    candidate.userIdentityId === input.ownerIdentityId
    && input.preferredRelationId
    && candidate.id === input.preferredRelationId
    && candidate.characterId === character.id,
  ) || findRelationshipForCanonicalCharacter(
    input.relationships,
    input.ownerIdentityId,
    character.id,
    input.characters,
  ) || createRelationship({
    id: getRelationshipNetworkNpcActorRelationId(input.npc.id),
    characterId: character.id,
    userIdentityId: input.ownerIdentityId,
    now: input.npc.createdAt,
    relationship: "unknown",
  });

  return {
    character,
    relationship,
    isPromoted: Boolean(character.relationshipNetworkNpcId === input.npc.id
      && character.id !== getRelationshipNetworkNpcActorCharacterId(input.npc.id)),
  };
}
