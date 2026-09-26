import type { Character, UserIdentity } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import type { CharacterPhoneContact, CharacterPhoneRecord } from "../../domain/characterPhone/types";
import {
  createCharacterPhone,
  getCharacterPhone,
  saveCharacterPhone,
} from "../../core/storage/repositories/characterPhoneRepository";
import { createCharacterPhoneInitialAvatar } from "./characterPhoneContactVisuals";
import { appendCharacterPhoneThreadMessage } from "./characterPhoneThreadService";

/** Stable marker used to keep an out-of-band phone reaction out of main chat. */
export const CHARACTER_BLOCK_REACTION_SOURCE_PREFIX = "character-block-reaction-";

export function isCharacterBlockReactionMessage(sourceMessageId?: string): boolean {
  return Boolean(sourceMessageId?.startsWith(CHARACTER_BLOCK_REACTION_SOURCE_PREFIX));
}

function getUserContactId(phone: CharacterPhoneRecord, relation: CharacterRelationship): string {
  return `character-phone:${phone.id}:contact:user-${relation.id}`;
}

function ensureUserContact(
  phone: CharacterPhoneRecord,
  relation: CharacterRelationship,
  identity?: UserIdentity,
): { phone: CharacterPhoneRecord; contactId: string } {
  const contactId = getUserContactId(phone, relation);
  if (phone.contacts.some((contact) => contact.id === contactId)) return { phone, contactId };
  const name = identity?.name?.trim() || "用户";
  const contact: CharacterPhoneContact = {
    id: contactId,
    name,
    relation: `身份聊天 · ${name}`,
    userIdentityId: relation.userIdentityId,
    relationId: relation.id,
    kind: "user",
    isLongTerm: true,
    isNpc: false,
    avatar: identity?.avatar || createCharacterPhoneInitialAvatar(name),
    source: "user",
    sourceRefs: [{ kind: "character", id: relation.userIdentityId }],
  };
  return { phone: { ...phone, contacts: [...phone.contacts, contact] }, contactId };
}

/**
 * Writes the character's private reaction to the role phone only. It is not a
 * main-chat Message, so the user phone cannot render it as a sent bubble.
 */
export function recordCharacterBlockReaction(input: {
  ownerIdentityId: string;
  character: Character;
  relation: CharacterRelationship;
  identity?: UserIdentity;
  requestCreated: boolean;
  now?: number;
}): CharacterPhoneRecord | undefined {
  if (input.character.isGroupChat || !input.ownerIdentityId) return undefined;
  const now = input.now ?? Date.now();
  const phone = getCharacterPhone(input.ownerIdentityId, input.character.id)
    || createCharacterPhone(input.ownerIdentityId, input.character, now);
  const ensured = ensureUserContact(phone, input.relation, input.identity);
  const sourceMessageId = `${CHARACTER_BLOCK_REACTION_SOURCE_PREFIX}${input.relation.blockCycleId || now}`;
  if (ensured.phone.threadMessages.some((message) => message.sourceMessageId === sourceMessageId)) {
    return ensured.phone;
  }
  const reactionTexts = input.requestCreated
    ? ["我怎么被拉黑啦？不要啊！", "我先给你发好友申请，你记得看看。"]
    : ["我怎么被拉黑啦？不要啊！", "我知道你现在不想联系，我先不打扰。"];
  const reactedPhone = reactionTexts.reduce((current, content, index) => appendCharacterPhoneThreadMessage({
    phone: current,
    contactId: ensured.contactId,
    content,
    sender: "character",
    sourceMessageId,
    deliveryStatus: "blocked",
    deliverySummary: "消息已发出，但被对方拒收了。",
    recordActivity: false,
    now: now + index,
  }), ensured.phone);
  saveCharacterPhone(reactedPhone);
  return reactedPhone;
}
