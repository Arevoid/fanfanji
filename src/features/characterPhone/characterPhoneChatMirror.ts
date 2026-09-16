import type { Character, Message } from "../../types";
import type { CharacterPhoneRecord, CharacterPhoneThreadMessage } from "../../domain/characterPhone/types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { getConversationId } from "../../domain/relationship/characterRelationship";
import { createCharacterTextMessage } from "../chat/services/messageFactory";

export interface CharacterPhoneChatMirrorResult {
  phone: CharacterPhoneRecord;
  messages: Message[];
  ownerIdentityId: string;
}

/**
 * Promotes only newly generated role-authored messages in the phone's direct
 * owner thread into the matching main-chat relationship. Simulated owner-side
 * lines are never fabricated as user messages.
 */
export function mirrorGeneratedCharacterPhoneChat(input: {
  phone: CharacterPhoneRecord;
  previousPhone: CharacterPhoneRecord;
  character: Character;
  relationships: readonly CharacterRelationship[];
  mainMessages: readonly Message[];
  now: number;
}): CharacterPhoneChatMirrorResult | undefined {
  const previousMessageIds = new Set(input.previousPhone.threadMessages.map((message) => message.id));
  const directContacts = input.phone.contacts.filter((contact) =>
    !contact.removedAt
    && !contact.historyOnly
    && (contact.kind === "user" || contact.source === "user")
    && (!contact.userIdentityId || contact.userIdentityId === input.phone.ownerIdentityId));
  const generatedByContact = new Map<string, CharacterPhoneThreadMessage[]>();
  for (const message of input.phone.threadMessages) {
    if (previousMessageIds.has(message.id)
      || message.sender !== "character"
      || !message.lifeEventId
      || message.sourceMessageId
      || !message.content.trim()) continue;
    const contact = directContacts.find((candidate) => candidate.id === message.contactId);
    if (!contact) continue;
    const messages = generatedByContact.get(contact.id) || [];
    messages.push(message);
    generatedByContact.set(contact.id, messages);
  }

  if (generatedByContact.size === 0) return undefined;

  const relationships = input.relationships.filter((relation) =>
    relation.characterId === input.character.id
    && relation.userIdentityId === input.phone.ownerIdentityId);
  const promotedMessages: Message[] = [];
  const sourceIdsByThreadId = new Map<string, string>();
  let timestamp = input.now;

  for (const [contactId, threadMessages] of generatedByContact) {
    const contact = directContacts.find((candidate) => candidate.id === contactId);
    if (!contact) continue;
    const matchingRelationships = contact.relationId
      ? relationships.filter((relation) => relation.id === contact.relationId)
      : relationships;
    // An ambiguous or stale relationship is not a safe destination.
    if (matchingRelationships.length !== 1) continue;
    const relation = matchingRelationships[0];
    const relationMessages = input.mainMessages.filter((message) =>
      message.characterId === input.character.id
      && (message.relationId === relation.id
        || (!message.relationId && message.conversationId === (relation.conversationId || getConversationId(relation.id)))));
    timestamp = Math.max(timestamp, ...relationMessages.map((message) => message.timestamp + 1));
    [...threadMessages].sort((left, right) => left.timestamp - right.timestamp).forEach((threadMessage, index) => {
      const id = `character-phone-generated:${input.phone.id}:${threadMessage.id}`;
      sourceIdsByThreadId.set(threadMessage.id, id);
      if (input.mainMessages.some((message) => message.id === id)) return;
      promotedMessages.push(createCharacterTextMessage({
        id,
        characterId: input.character.id,
        relationId: relation.id,
        conversationId: relation.conversationId || getConversationId(relation.id),
        content: threadMessage.content.trim().slice(0, 1000),
        timestamp: timestamp + index,
      }));
    });
    timestamp += threadMessages.length;
  }

  if (sourceIdsByThreadId.size === 0) return undefined;
  return {
    phone: {
      ...input.phone,
      threadMessages: input.phone.threadMessages.map((message) => {
        const sourceMessageId = sourceIdsByThreadId.get(message.id);
        if (!sourceMessageId) return message;
        const mirrored = promotedMessages.find((candidate) => candidate.id === sourceMessageId);
        const promoted = mirrored || input.mainMessages.find((candidate) => candidate.id === sourceMessageId);
        return {
          ...message,
          sourceMessageId,
          ...(promoted ? { timestamp: promoted.timestamp } : {}),
        };
      }),
    },
    messages: promotedMessages,
    ownerIdentityId: input.phone.ownerIdentityId,
  };
}
