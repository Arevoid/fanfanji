import type {
  Character,
  Message,
  Moment,
  UserIdentity,
  WorldBookEntry,
} from "../../types";
import { listRelationshipsForIdentityWorkspace, type CharacterRelationship } from "../../domain/relationship/characterRelationship";
import type { CharacterPhoneRecord } from "../../domain/characterPhone/types";
import type { CharacterPhoneRelationshipNetworkContact } from "./characterPhoneRelationshipNetwork";
import { isWorldBookEntryVisible } from "../../domain/worldbook/worldBookVisibility";

export type CharacterPhoneContextSourceKind = "character" | "worldbook" | "chat" | "moment" | "phone" | "relationship-network";

export interface CharacterPhoneContextSourceRef {
  kind: CharacterPhoneContextSourceKind;
  id: string;
}

export interface CharacterPhoneLifeContext {
  ownerIdentityId: string;
  characterId: string;
  character: Character;
  activeIdentity?: UserIdentity;
  relationships: CharacterRelationship[];
  relationIds: string[];
  conversationIds: string[];
  worldBookEntries: WorldBookEntry[];
  messages: Message[];
  recentMessages: Message[];
  moments: Moment[];
  recentMoments: Moment[];
  relationshipNetworkContacts: CharacterPhoneRelationshipNetworkContact[];
  sourceRefs: CharacterPhoneContextSourceRef[];
}

export function selectCharacterPhoneWorldBookEntries(input: {
  entries: WorldBookEntry[];
  characterId: string;
  ownerIdentityId: string;
  relationIds: string[];
}): WorldBookEntry[] {
  const contexts = input.relationIds.length > 0 ? input.relationIds : [undefined];
  return input.entries.filter((entry) => contexts.some((relationId) =>
    isWorldBookEntryVisible(entry, {
      scenario: "chat",
      characterId: input.characterId,
      userIdentityId: input.ownerIdentityId,
      relationId,
    }),
  ));
}

function isScopedPhoneMessage(
  message: Message,
  characterId: string,
  relationIds: Set<string>,
  conversationIds: Set<string>,
): boolean {
  if (message.characterId !== characterId || message.id.startsWith("phone-proactive-")) return false;
  if (message.relationId) return relationIds.has(message.relationId);
  return Boolean(message.conversationId && conversationIds.has(message.conversationId));
}

function isOwnedMoment(moment: Moment, ownerIdentityId: string): boolean {
  return (moment.ownerIdentityId || "identity-1") === ownerIdentityId;
}

export function buildCharacterPhoneLifeContext(input: {
  phone: CharacterPhoneRecord;
  character: Character;
  activeIdentity?: UserIdentity;
  relationships: CharacterRelationship[];
  messages: Message[];
  moments: Moment[];
  worldBookEntries: WorldBookEntry[];
  relationshipNetworkContacts?: CharacterPhoneRelationshipNetworkContact[];
  identities?: UserIdentity[];
}): CharacterPhoneLifeContext {
  const identities = input.identities ?? [];
  // The phone is still owned by the primary identity, but direct chats made
  // through one of its aliases are part of the same identity workspace. This
  // lets the role phone show evidence-backed alias conversations without
  // importing another user's data.
  const relationships = listRelationshipsForIdentityWorkspace(
    input.relationships.filter((relation) => relation.characterId === input.character.id),
    input.phone.ownerIdentityId,
    identities,
  );
  const ownerRelationships = input.relationships.filter((relation) =>
    relation.userIdentityId === input.phone.ownerIdentityId
      && relation.characterId === input.character.id,
  );
  const relationIds = relationships.map((relation) => relation.id);
  const conversationIds = relationships.map((relation) => relation.conversationId).filter(Boolean);
  const relationIdSet = new Set(relationIds);
  const conversationIdSet = new Set(conversationIds);
  const worldBookEntries = selectCharacterPhoneWorldBookEntries({
    entries: input.worldBookEntries,
    characterId: input.character.id,
    ownerIdentityId: input.phone.ownerIdentityId,
    // World-book visibility remains tied to the primary phone owner. Alias
    // chat history is mirrored below, but an alias must not change which
    // private world-book entries the role phone can read.
    relationIds: ownerRelationships.map((relation) => relation.id),
  });
  const messages = input.messages
    .filter((message) => isScopedPhoneMessage(message, input.character.id, relationIdSet, conversationIdSet))
    .sort((left, right) => left.timestamp - right.timestamp);
  const moments = input.moments
    .filter((moment) => isOwnedMoment(moment, input.phone.ownerIdentityId))
    .sort((left, right) => left.timestamp - right.timestamp);
  const relationshipNetworkContacts = (input.relationshipNetworkContacts || [])
    .filter((contact) => contact.npc.ownerIdentityId === input.phone.ownerIdentityId);
  const sourceRefs: CharacterPhoneContextSourceRef[] = [
    { kind: "character", id: input.character.id },
    ...worldBookEntries.map((entry) => ({ kind: "worldbook" as const, id: entry.id })),
    ...messages.slice(-20).map((message) => ({ kind: "chat" as const, id: message.id })),
    ...moments.slice(-12).map((moment) => ({ kind: "moment" as const, id: moment.id })),
    ...relationshipNetworkContacts.map((contact) => ({ kind: "relationship-network" as const, id: contact.npc.id })),
    ...(input.phone.updatedAt ? [{ kind: "phone" as const, id: input.phone.id }] : []),
  ];
  return {
    ownerIdentityId: input.phone.ownerIdentityId,
    characterId: input.character.id,
    character: input.character,
    activeIdentity: input.activeIdentity?.id === input.phone.ownerIdentityId ? input.activeIdentity : undefined,
    relationships,
    relationIds,
    conversationIds,
    worldBookEntries,
    messages,
    recentMessages: messages.slice(-20),
    moments,
    recentMoments: moments.slice(-12),
    relationshipNetworkContacts,
    sourceRefs,
  };
}
