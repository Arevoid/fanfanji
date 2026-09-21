import type {
  Character,
  Message,
  Moment,
  UserIdentity,
  WorldBookEntry,
  MusicTrack,
} from "../../types";
import { DEFAULT_IDENTITY_ID, type CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../../domain/character/characterIdentity";
import { buildCharacterPhoneLifeContext } from "./characterPhoneLifeContext";
import { listCharacterPhoneRelationshipNetworkContacts, type CharacterPhoneRelationshipNetworkContact } from "./characterPhoneRelationshipNetwork";
import { createCharacterPhoneInitialAvatar, normalizeCharacterPhoneContactName } from "./characterPhoneContactVisuals";
export { selectCharacterPhoneWorldBookEntries } from "./characterPhoneLifeContext";
import type {
  CharacterPhoneContact,
  CharacterPhoneMessage,
  CharacterPhonePost,
  CharacterPhonePostComment,
  CharacterPhoneRecord,
  CharacterPhoneMusicPlaylist,
  CharacterPhoneMusicTrack,
  CharacterPhoneListeningRecord,
  CharacterPhoneThreadMessage,
} from "../../domain/characterPhone/types";
import type { RelationshipNetworkMap, RelationshipNetworkNpc } from "../../domain/relationshipNetwork/relationshipNetworkTypes";

export interface CharacterPhoneContentInput {
  phone: CharacterPhoneRecord;
  character: Character;
  characters: Character[];
  activeIdentity?: UserIdentity;
  /** All identities in the same account, used only to scope alias chat evidence. */
  identities?: UserIdentity[];
  relationships: CharacterRelationship[];
  messages: Message[];
  moments: Moment[];
  worldBookEntries: WorldBookEntry[];
  relationshipNetworkNpcs?: RelationshipNetworkNpc[];
  relationshipNetworkMaps?: RelationshipNetworkMap[];
  musicTracks?: MusicTrack[];
  now?: number;
}

const LEGACY_MUSIC_TITLES = new Set([
  "Night Mood",
  "Quiet City Lights",
  "Soft Rain",
  "First Light",
]);

function scopedId(phoneId: string, kind: string, key: string): string {
  return `character-phone:${phoneId}:${kind}:${key}`;
}

function canonicalMusicSourceId(phoneId: string, value: string): string {
  const prefix = `${scopedId(phoneId, "music", "")}`;
  let sourceId = value;
  while (sourceId.startsWith(prefix)) sourceId = sourceId.slice(prefix.length);
  return sourceId || "unknown";
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function contactKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function linkedCharacterId(contact: CharacterPhoneContact): string | undefined {
  if (contact.linkedCharacterId) return contact.linkedCharacterId;
  if (contact.source !== "linked" || contact.kind !== "character") return undefined;
  return contact.sourceRefs?.find((source) => source.kind === "character")?.id;
}

function verifiedContactIdentityKey(
  contact: CharacterPhoneContact,
  characters: readonly Character[],
): string | undefined {
  if (contact.source === "user" || contact.kind === "user") {
    // Each direct relation is a distinct user chat window. A phone-wide
    // `user` key incorrectly merged every alias conversation into one.
    return `user:${contact.relationId || contact.id}`;
  }
  const characterId = linkedCharacterId(contact);
  if (characterId) return `character:${resolveCanonicalCharacterId(characterId, characters)}`;
  const networkNpcId = contact.relationshipNetworkNpcId
    || contact.sourceRefs?.find((source) => source.kind === "relationship-network")?.id;
  return networkNpcId ? `relationship-network:${networkNpcId}` : undefined;
}

function mergeVerifiedDuplicateContacts(
  contacts: CharacterPhoneContact[],
  threadMessages: CharacterPhoneThreadMessage[],
  characters: readonly Character[],
): { contacts: CharacterPhoneContact[]; threadMessages: CharacterPhoneThreadMessage[] } {
  const keptByIdentity = new Map<string, CharacterPhoneContact>();
  const keptById = new Map<string, CharacterPhoneContact>();
  const remappedContactIds = new Map<string, string>();
  const merged: CharacterPhoneContact[] = [];

  contacts.forEach((contact) => {
    const identityKey = verifiedContactIdentityKey(contact, characters);
    const previous = (identityKey && keptByIdentity.get(identityKey)) || keptById.get(contact.id);
    if (previous) {
      remappedContactIds.set(contact.id, previous.id);
      return;
    }
    merged.push(contact);
    keptById.set(contact.id, contact);
    if (identityKey) keptByIdentity.set(identityKey, contact);
  });

  return {
    contacts: merged,
    threadMessages: threadMessages.map((message) => {
      const contactId = remappedContactIds.get(message.contactId);
      return contactId ? { ...message, contactId } : message;
    }),
  };
}

function isGenericContactName(name: string): boolean {
  return /^(?:很多|不少|一些|若干|几个|几位|一群|一堆|各种|多人|无|没有|未知|不详)$/.test(name.trim());
}

function buildContext(character: Character, entries: WorldBookEntry[]): string {
  return [
    character.name,
    character.personality,
    character.backstory,
    ...entries.map((entry) => entry.content),
  ].filter(Boolean).join(" ").toLowerCase();
}

function toCharacterMessage(message: Message, phoneId: string, contactId: string): CharacterPhoneThreadMessage {
  return {
    id: scopedId(phoneId, "message", message.id),
    contactId,
    sender: message.sender === "character" ? "character" : "contact",
    content: message.content,
    timestamp: message.timestamp,
    sourceMessageId: message.id,
    ...(message.recalledAt ? { recalledAt: message.recalledAt } : {}),
  };
}

function isCurrentUserMessage(
  message: Message,
  characterId: string,
  relations: CharacterRelationship[],
  characters: readonly Character[] = [],
): boolean {
  if (resolveCanonicalCharacterId(message.characterId, characters) !== resolveCanonicalCharacterId(characterId, characters)) return false;
  const relationIds = new Set(relations.map((relation) => relation.id));
  if (message.relationId) return relationIds.has(message.relationId);
  const conversationIds = new Set(relations.map((relation) => relation.conversationId).filter(Boolean));
  return Boolean(message.conversationId && conversationIds.has(message.conversationId));
}

function findRelationshipForMessage(
  message: Message,
  relations: CharacterRelationship[],
): CharacterRelationship | undefined {
  if (message.relationId) {
    const matches = relations.filter((relation) => relation.id === message.relationId);
    return matches.length === 1 ? matches[0] : undefined;
  }
  if (!message.conversationId) return undefined;
  const matches = relations.filter((relation) => relation.conversationId === message.conversationId);
  return matches.length === 1 ? matches[0] : undefined;
}

function isUserPhoneContact(contact: CharacterPhoneContact): boolean {
  return contact.kind === "user" || contact.source === "user";
}

function makeUserContact(
  phone: CharacterPhoneRecord,
  identity: UserIdentity | undefined,
  relation?: CharacterRelationship,
): CharacterPhoneContact {
  const name = identity?.name?.trim() || "用户";
  return {
    id: scopedId(phone.id, "contact", relation ? `user-${relation.id}` : "user"),
    name,
    relation: relation ? `身份聊天 · ${name}` : "与角色聊天",
    ...(identity?.id ? { userIdentityId: identity.id } : {}),
    ...(relation ? { relationId: relation.id } : {}),
    kind: "user",
    isLongTerm: true,
    isNpc: false,
    avatar: identity?.avatar || createCharacterPhoneInitialAvatar(identity?.name?.trim() || "用户"),
    source: "user",
    sourceRefs: identity?.id ? [{ kind: "character", id: identity.id }] : [],
  };
}

function makeUserContacts(input: CharacterPhoneContentInput): CharacterPhoneContact[] {
  const identities = input.identities ?? [];
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  const relationsById = new Map(input.relationships.map((relation) => [relation.id, relation]));
  const contacts = [...relationsById.values()].map((relation) => makeUserContact(
    input.phone,
    identityById.get(relation.userIdentityId)
      || (relation.userIdentityId === input.phone.ownerIdentityId ? input.activeIdentity : undefined),
    relation,
  ));
  return contacts.length > 0 ? contacts : [makeUserContact(input.phone, input.activeIdentity)];
}

function buildContextContacts(
  phone: CharacterPhoneRecord,
  character: Character,
  entries: WorldBookEntry[],
): CharacterPhoneContact[] {
  const candidates: Array<{
    name: string;
    relation: string;
    kind: "npc" | "group";
    memberNames?: string[];
    sourceRef: { kind: "character" | "worldbook"; id: string };
  }> = [];
  const addCandidate = (
    name: string,
    relation: string,
    sourceRef: { kind: "character" | "worldbook"; id: string },
    kind: "npc" | "group" = "npc",
    memberNames?: string[],
  ) => {
    const normalizedName = normalizeCharacterPhoneContactName(name, [], { allowPronounStart: kind === "group" });
    if (!normalizedName || isGenericContactName(normalizedName)) return;
    if (normalizedName === character.name || candidates.some((candidate) => candidate.name === normalizedName)) return;
    candidates.push({ name: normalizedName, relation, sourceRef, kind, memberNames });
  };
  const parseSource = (rawContext: string, sourceRef: { kind: "character" | "worldbook"; id: string }) => {
    const relationPattern = /(?:家人|父亲|母亲|爸爸|妈妈|哥哥|姐姐|弟弟|妹妹|朋友|好友|同事|同学|老师|上司|邻居|前任|恋人|队友|搭档)\s*[：:]\s*([^\n。；;,，]+)/g;
    for (const match of rawContext.matchAll(relationPattern)) {
      const label = match[0].split(/[：:]/)[0]?.trim() || "联系人";
      match[1].split(/[、，,及和与]/).forEach((name) => addCandidate(name, label, sourceRef));
    }
    const describedRelationPattern = /([A-Za-z\u4e00-\u9fff·]{2,16})\s*(?:是|为)[^\n。；;]{0,12}(家人|朋友|好友|同事|同学|老师|上司|邻居|前任|恋人|队友|搭档)/g;
    for (const match of rawContext.matchAll(describedRelationPattern)) addCandidate(match[1], match[2], sourceRef);
    const groupPattern = /(?:群聊|群组|家庭群|家人群|工作群|朋友群|同事群|班级群)\s*[：:]\s*([^\n（(。；;]{2,24})(?:[（(](?:成员[：:]?)?([^)）]+)[)）])?/g;
    for (const match of rawContext.matchAll(groupPattern)) {
      const memberNames = match[2]?.split(/[、，,及和与]/).map((name) => name.trim()).filter(Boolean).slice(0, 20);
      addCandidate(match[1], "群聊", sourceRef, "group", memberNames);
    }
  };
  parseSource(`${character.personality || ""}\n${character.backstory || ""}`, { kind: "character", id: character.id });
  entries.forEach((entry) => parseSource(entry.content, { kind: "worldbook", id: entry.id }));

  const existingNames = new Set((phone.contacts ?? []).map((contact) => contactKey(contact.name)));
  return candidates
    .filter((candidate) => !existingNames.has(contactKey(candidate.name)) && candidate.name !== character.name)
    .map((candidate, index) => ({
      id: scopedId(phone.id, "contact", `context-${candidate.name}`),
      name: candidate.name,
      relation: candidate.relation,
      kind: candidate.kind,
      isLongTerm: index === 0,
      isNpc: true,
      source: "generated" as const,
      memberNames: candidate.memberNames,
      sourceRefs: [candidate.sourceRef],
      avatar: createCharacterPhoneInitialAvatar(candidate.name),
    }));
}

function syncContacts(input: CharacterPhoneContentInput): {
  contacts: CharacterPhoneContact[];
  threadMessages: CharacterPhoneThreadMessage[];
} {
  const userContacts = makeUserContacts(input);
  const userContactByRelationId = new Map(userContacts
    .filter((contact) => contact.relationId)
    .map((contact) => [contact.relationId!, contact]));
  const roleCharacterId = resolveCanonicalCharacterId(input.character.id, input.characters);
  const networkContacts = listCharacterPhoneRelationshipNetworkContacts({
    character: input.character,
    ownerIdentityId: input.phone.ownerIdentityId,
    characters: input.characters,
    npcs: input.relationshipNetworkNpcs || [],
    maps: input.relationshipNetworkMaps || [],
  }).filter((network) => !network.linkedCharacterId
    || resolveCanonicalCharacterId(network.linkedCharacterId, input.characters) !== roleCharacterId);
  const toNetworkContact = (network: CharacterPhoneRelationshipNetworkContact): CharacterPhoneContact => ({
    id: scopedId(input.phone.id, "contact", `network-${network.npc.id}`),
    name: network.npc.name,
    relation: network.relationLabels.length > 0
      ? `关系网：${network.relationLabels.join("、")}`
      : "关系网联系人",
    kind: "npc",
    isLongTerm: true,
    isNpc: true,
    avatar: network.npc.avatar || createCharacterPhoneInitialAvatar(network.npc.name),
    source: "linked",
    linkedCharacterId: network.linkedCharacterId,
    relationshipNetworkNpcId: network.npc.id,
    sourceRefs: [{ kind: "relationship-network", id: network.npc.id }],
  });
  // Keep removed contacts in the record. They are a soft-unlink: the contact
  // disappears from the visible inbox but its old thread and deletion fact
  // must remain available to the character's later reactions.
  const existing = input.phone.contacts ?? [];
  const existingUserContacts = existing.filter(isUserPhoneContact);
  const existingUserContactById = new Map(existingUserContacts.map((contact) => [contact.id, contact]));
  const sourceMessagesById = new Map(input.messages.map((message) => [message.id, message]));
  const threadMessages = (input.phone.threadMessages ?? []).map((message) => {
    const oldContact = existingUserContactById.get(message.contactId);
    if (!oldContact) return message;
    const sourceMessage = message.sourceMessageId ? sourceMessagesById.get(message.sourceMessageId) : undefined;
    const relation = sourceMessage
      ? findRelationshipForMessage(sourceMessage, input.relationships)
      : oldContact.relationId
        ? input.relationships.find((candidate) => candidate.id === oldContact.relationId)
        : undefined;
    const userContact = relation ? userContactByRelationId.get(relation.id) : undefined;
    return userContact ? { ...message, contactId: userContact.id } : message;
  });
  const unresolvedLegacyContactIds = new Set(threadMessages
    .filter((message) => existingUserContactById.has(message.contactId))
    .map((message) => message.contactId));
  const historicalUserContacts = existingUserContacts
    .filter((contact) => unresolvedLegacyContactIds.has(contact.id)
      && !userContacts.some((userContact) => userContact.id === contact.id))
    .map((contact) => contact.relationId
      ? { ...contact, historyOnly: true }
      : {
          ...contact,
          name: "历史聊天记录",
          relation: "旧版记录 · 来源身份未确认",
          userIdentityId: undefined,
          relationId: undefined,
          historyOnly: true,
        });
  const knownContactNames = [
    ...input.characters.map((candidate) => candidate.name),
    ...networkContacts.map((contact) => contact.npc.name),
  ].filter(Boolean);
  const networkByIdentity = new Map(networkContacts.map((network) => {
    const contact = toNetworkContact(network);
    return [verifiedContactIdentityKey(contact, input.characters), network] as const;
  }).filter((entry): entry is readonly [string, CharacterPhoneRelationshipNetworkContact] => Boolean(entry[0])));
  const normalizedExisting: CharacterPhoneContact[] = existing
    .filter((contact) => !isUserPhoneContact(contact))
    .filter((contact) => !isGenericContactName(contact.name))
    .flatMap((contact): CharacterPhoneContact[] => {
      const normalizedName = normalizeCharacterPhoneContactName(
        contact.name,
        knownContactNames,
        { allowPronounStart: contact.kind === "group" },
      );
      // Malformed AI-generated titles are discarded instead of resurfacing
      // as broken contacts after a phone refresh. Linked names are protected
      // by the known-name fast path above.
      if (!normalizedName) return [];
      let normalizedContact = { ...contact, name: normalizedName };
      const linkedId = linkedCharacterId(normalizedContact);
      const canonicalLinkedId = linkedId ? resolveCanonicalCharacterId(linkedId, input.characters) : undefined;
      if (canonicalLinkedId === roleCharacterId) {
        // Old phone versions could project a legacy contact copy of the phone's
        // own character. Keep it hidden and retain its old thread data.
        return [{ ...normalizedContact, removedAt: normalizedContact.removedAt || (input.now ?? Date.now()) }];
      }
      const linkedProfile = canonicalLinkedId
        ? input.characters.find((candidate) => candidate.id === canonicalLinkedId && !candidate.isContactInstance)
        : undefined;
      if (linkedProfile && (linkedProfile.ownerIdentityId || DEFAULT_IDENTITY_ID) !== input.phone.ownerIdentityId) {
        // Older versions could copy a different alias's archive character into
        // this shared phone. Preserve its old messages, but hide that row from
        // the current primary-owned contact list.
        return [{ ...normalizedContact, removedAt: normalizedContact.removedAt || (input.now ?? Date.now()) }];
      }
      if (canonicalLinkedId && linkedId !== canonicalLinkedId) {
        normalizedContact = {
          ...normalizedContact,
          linkedCharacterId: canonicalLinkedId,
          sourceRefs: normalizedContact.sourceRefs?.map((source) => source.kind === "character"
            && source.id === linkedId
            ? { ...source, id: canonicalLinkedId }
            : source),
        };
      }
      const identityKey = verifiedContactIdentityKey(normalizedContact, input.characters);
      const network = identityKey ? networkByIdentity.get(identityKey) : undefined;
      if (!network) {
        const source = normalizedContact.source ?? (normalizedContact.isNpc
          ? (normalizedContact.linkedCharacterId || normalizedContact.relationshipNetworkNpcId ? "linked" : "generated")
          : "user");
        const hasLinkedAvatar = source === "user"
          || source === "linked"
          || Boolean(normalizedContact.linkedCharacterId || normalizedContact.relationshipNetworkNpcId);
        return [{
          ...normalizedContact,
          source,
          kind: normalizedContact.kind ?? (source === "user" || !normalizedContact.isNpc ? "user" : source === "linked" ? "character" : "npc"),
          // Generated NPCs must never inherit the role's avatar. Only the
          // user, linked characters, and relationship-network NPCs keep a
          // real avatar; other contacts get stable initials avatars.
          avatar: hasLinkedAvatar ? normalizedContact.avatar : createCharacterPhoneInitialAvatar(normalizedName),
        }];
      }
      return [{
        ...normalizedContact,
        relation: network.relationLabels.length > 0 ? `关系网：${network.relationLabels.join("、")}` : normalizedContact.relation,
        kind: "npc" as const,
        isNpc: true,
        source: "linked" as const,
        avatar: network.npc.avatar || createCharacterPhoneInitialAvatar(network.npc.name),
        linkedCharacterId: network.linkedCharacterId || contact.linkedCharacterId,
        relationshipNetworkNpcId: network.npc.id,
        sourceRefs: [{ kind: "relationship-network" as const, id: network.npc.id }, ...(contact.sourceRefs || [])],
        // Keep the NPC/linked character name as the visible contact title.
        // The role is already available from the relationship label/context;
        // storing it as remark would make the UI display e.g. “旧识” instead
        // of the actual NPC name “林深”.
        remark: contact.remark === network.npc.role ? undefined : contact.remark,
      }];
    });
  const contactEvidenceContext = [
    input.character.personality,
    input.character.backstory,
    ...input.worldBookEntries.map((entry) => entry.content),
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  const linkedContacts = input.characters
    .filter((candidate) => !candidate.isContactInstance && !candidate.isGroupChat)
    .filter((candidate) => (candidate.ownerIdentityId || DEFAULT_IDENTITY_ID) === input.phone.ownerIdentityId)
    .filter((candidate) => resolveCanonicalCharacterId(candidate.id, input.characters) !== roleCharacterId)
    .filter((candidate) => contactEvidenceContext.includes(candidate.name.toLocaleLowerCase()))
    .filter((candidate) => {
      const identityKey = `character:${resolveCanonicalCharacterId(candidate.id, input.characters)}`;
      return !normalizedExisting.some((contact) => verifiedContactIdentityKey(contact, input.characters) === identityKey);
    })
    .map((candidate) => ({
      id: scopedId(input.phone.id, "contact", `linked-${candidate.id}`),
      name: candidate.name,
      relation: "与角色有关联的联系人",
      kind: "character" as const,
      isLongTerm: true,
      isNpc: true,
      avatar: candidate.avatar || createCharacterPhoneInitialAvatar(candidate.name),
      source: "linked" as const,
      linkedCharacterId: resolveCanonicalCharacterId(candidate.id, input.characters),
      sourceRefs: [{ kind: "character" as const, id: resolveCanonicalCharacterId(candidate.id, input.characters) }],
    }));
  const networkLinkedContacts = networkContacts
    .filter((network) => {
      const networkContact = toNetworkContact(network);
      const identityKey = verifiedContactIdentityKey(networkContact, input.characters);
      return !normalizedExisting.some((contact) => identityKey
        && verifiedContactIdentityKey(contact, input.characters) === identityKey);
    })
    .map(toNetworkContact);
  const generated = buildContextContacts(input.phone, input.character, input.worldBookEntries);
  const nextContacts = [...userContacts, ...historicalUserContacts, ...normalizedExisting, ...linkedContacts, ...networkLinkedContacts, ...generated];
  const existingThreadMessages = mergeVerifiedDuplicateContacts(
    nextContacts,
    threadMessages,
    input.characters,
  );
  return existingThreadMessages;
}

function buildRelationshipNetworkPhoneContacts(
  phone: CharacterPhoneRecord,
  contacts: CharacterPhoneRelationshipNetworkContact[],
): CharacterPhoneContact[] {
  return contacts.map((network) => ({
    id: scopedId(phone.id, "contact", `network-${network.npc.id}`),
    name: network.npc.name,
    relation: network.relationLabels.length > 0
      ? `关系网：${network.relationLabels.join("、")}`
      : "关系网联系人",
    kind: "npc" as const,
    isLongTerm: true,
    isNpc: true,
    avatar: network.npc.avatar || createCharacterPhoneInitialAvatar(network.npc.name),
    source: "linked" as const,
    linkedCharacterId: network.linkedCharacterId,
    relationshipNetworkNpcId: network.npc.id,
    sourceRefs: [{ kind: "relationship-network" as const, id: network.npc.id }],
  }));
}

function syncUserChat(
  phone: CharacterPhoneRecord,
  character: Character,
  userContacts: CharacterPhoneContact[],
  messages: Message[],
  relations: CharacterRelationship[],
  characters: readonly Character[] = [],
): { threadMessages: CharacterPhoneThreadMessage[]; lastMessageId?: string } {
  const sourceMessages = [...new Map(messages
    .filter((message) => isCurrentUserMessage(message, character.id, relations, characters))
    // Phone-generated notifications are persisted in the main chat for
    // awareness reactions, but they are not part of the user's real thread
    // mirror and must not be copied back as ordinary chat history.
    .filter((message) => !message.id.startsWith("phone-proactive-"))
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((message) => [message.id, message])).values()];
  const currentUserContactIds = new Set(userContacts.map((contact) => contact.id));
  const synced: CharacterPhoneThreadMessage[] = [];
  userContacts.forEach((userContact) => {
    const relation = userContact.relationId
      ? relations.find((candidate) => candidate.id === userContact.relationId)
      : undefined;
    const relationMessages = relation
      ? sourceMessages.filter((message) => findRelationshipForMessage(message, relations)?.id === relation.id)
      : sourceMessages.filter((message) => !findRelationshipForMessage(message, relations));
    const relationMessageIds = new Set(relationMessages.map((message) => message.id));
    const existingBySourceId = new Map<string, CharacterPhoneThreadMessage>();
    (phone.threadMessages ?? [])
      .filter((message) => message.contactId === userContact.id && message.sourceMessageId)
      .forEach((message) => {
        const sourceMessageId = message.sourceMessageId!;
        if (!relationMessageIds.has(sourceMessageId)) return;
        const previous = existingBySourceId.get(sourceMessageId);
        existingBySourceId.set(sourceMessageId, previous
          ? {
              ...previous,
              ...message,
              operatedByUser: previous.operatedByUser || message.operatedByUser,
              recalledAt: message.recalledAt || previous.recalledAt,
            }
          : message);
      });
    relationMessages.forEach((sourceMessage) => {
      const mirrored = toCharacterMessage(sourceMessage, phone.id, userContact.id);
      const previous = existingBySourceId.get(sourceMessage.id);
      synced.push(previous
        ? {
            ...previous,
            ...mirrored,
            // Keep generated thread IDs stable: life-event artifactRefs point
            // to them, while sourceMessageId is the separate main-chat link.
            id: previous.id,
            ...(previous.lifeEventId ? { lifeEventId: previous.lifeEventId } : {}),
            operatedByUser: previous.operatedByUser || mirrored.operatedByUser,
            recalledAt: mirrored.recalledAt || previous.recalledAt,
          }
        : mirrored);
    });
  });
  // The user conversation is a strict mirror of the scoped main-chat
  // messages. Keeping a phone-local fallback when the source thread is empty
  // makes stale/generated messages look like real conversation history in the
  // role phone even though the user's phone has no corresponding messages.
  // User-authored role-phone messages are written back to the main chat with a
  // sourceMessageId, so they are retained whenever their source still exists.
  const otherContactMessages = (phone.threadMessages ?? []).filter((message) => !currentUserContactIds.has(message.contactId));
  const threadMessages = [...otherContactMessages, ...synced];
  return {
    threadMessages: threadMessages.sort((left, right) => left.timestamp - right.timestamp),
    lastMessageId: sourceMessages.at(-1)?.id,
  };
}

function buildContactStarterMessage(contact: CharacterPhoneContact): string {
  if (contact.lastMessage?.trim()) return contact.lastMessage.trim().slice(0, 1000);
  if (contact.kind === "group") return "最近群里在聊一件事，有空记得看看。";
  const relation = (contact.relation || "").replace(/^关系网：/u, "");
  if (/(母亲|妈妈|父亲|爸爸|家人|哥哥|姐姐|弟弟|妹妹)/u.test(relation)) return "最近过得怎么样？有空回家吃饭。";
  if (/(朋友|好友|同事|同学|队友|搭档)/u.test(relation)) return "最近忙什么呢？有空出来聊聊。";
  if (/(老师|上司|邻居|前任|恋人)/u.test(relation)) return "最近还好吗？有空聊聊。";
  return "最近还好吗？有空聊聊。";
}

/**
 * Context/world-book contacts are real people in the role's life, but they
 * did not necessarily have a mirrored main-chat thread. Only preserve an
 * opener when the source contact explicitly supplied one; never invent the
 * same generic message for every contact. User chat remains a strict mirror.
 */
function syncContactThreads(
  phone: CharacterPhoneRecord,
  contacts: CharacterPhoneContact[],
  threadMessages: CharacterPhoneThreadMessage[],
  now: number,
): { contacts: CharacterPhoneContact[]; threadMessages: CharacterPhoneThreadMessage[] } {
  const nextMessages = [...threadMessages];
  const seededAt = Math.max(0, now - 2 * 60 * 1000);
  contacts
    .filter((contact) => !contact.removedAt && contact.source !== "user" && Boolean(contact.lastMessage?.trim()))
    .forEach((contact) => {
      const existing = nextMessages.some((message) => message.contactId === contact.id);
      if (existing) return;
      nextMessages.push({
        id: scopedId(phone.id, "contact-thread-starter", contact.id),
        contactId: contact.id,
        sender: "contact",
        content: buildContactStarterMessage(contact),
        timestamp: seededAt,
        ...(contact.sourceRefs?.length ? { sourceRefs: contact.sourceRefs } : {}),
      });
    });
  const sorted = nextMessages.sort((left, right) => left.timestamp - right.timestamp);
  return {
    threadMessages: sorted,
    contacts: contacts.map((contact) => {
      const latest = sorted.filter((message) => message.contactId === contact.id).at(-1);
      return latest
        ? { ...contact, lastMessage: latest.recalledAt ? "你撤回了一条信息" : latest.content, lastMessageAt: latest.timestamp }
        : contact;
    }),
  };
}

function syncMusic(
  phone: CharacterPhoneRecord,
  sourceTracks: MusicTrack[] | undefined,
  context: string,
): { musicTracks: CharacterPhoneMusicTrack[]; listeningHistory: CharacterPhoneListeningRecord[]; musicPlaylists: CharacterPhoneMusicPlaylist[] } {
  const sourceLibrary = sourceTracks && sourceTracks.length > 0
    ? sourceTracks.slice(0, 12)
    : [];
  const mappedLibrary = sourceLibrary.map((track, index) => {
    const sourceTrack = "url" in track ? track as MusicTrack : undefined;
    const sourceId = sourceTrack?.id || ("id" in track ? String(track.id) : `generated-${index}`);
    return {
      id: scopedId(phone.id, "music", canonicalMusicSourceId(phone.id, sourceId)),
      title: sourceTrack?.title || ("title" in track ? String(track.title) : ""),
      artist: sourceTrack?.artist || ("artist" in track ? String(track.artist) : ""),
      duration: sourceTrack?.duration || ("duration" in track ? String(track.duration) : "0:00"),
      coverUrl: sourceTrack?.coverUrl,
      sourceTrackId: sourceTrack?.id,
    } satisfies CharacterPhoneMusicTrack;
  }).filter((track) => track.title.trim());
  const persistedTrackIdMap = new Map<string, string>();
  const persistedTracks = (phone.musicTracks ?? [])
    .map((track) => {
      const prefix = scopedId(phone.id, "music", "");
      const normalizedId = track.id.startsWith(prefix)
        ? scopedId(phone.id, "music", canonicalMusicSourceId(phone.id, track.id))
        : track.id;
      persistedTrackIdMap.set(track.id, normalizedId);
      return normalizedId === track.id ? track : { ...track, id: normalizedId };
    })
    .filter((track) => track.title.trim());
  // Generated role-phone tracks are not part of the user's main library. Keep
  // them when the shared library is synchronized, otherwise the next phone
  // open would silently erase first-life tracks, listening history, and the
  // currently-playing selection. User-library tracks continue to be refreshed
  // from the current source list.
  const generatedTracks = persistedTracks
    .filter((track) => !track.sourceTrackId && !isLegacyMusicTrack(track))
    .filter((track) => track.title.trim());
  const libraryKeys = new Set(mappedLibrary.map((track) => `${track.title.trim()}|${track.artist.trim()}`.toLocaleLowerCase()));
  const musicTracks = sourceLibrary.length > 0
    ? [...mappedLibrary, ...generatedTracks.filter((track) => !libraryKeys.has(`${track.title.trim()}|${track.artist.trim()}`.toLocaleLowerCase()))]
    : persistedTracks.filter((track) => !isLegacyMusicTrack(track));
  const history = phone.listeningHistory?.length
    ? phone.listeningHistory
      .map((record) => {
        const normalizedTrackId = persistedTrackIdMap.get(record.trackId) || record.trackId;
        return normalizedTrackId === record.trackId ? record : { ...record, trackId: normalizedTrackId };
      })
      .filter((record) => musicTracks.some((track) => track.id === record.trackId))
    : [];
  const playlistName = includesAny(context, ["夜", "夜晚", "失眠", "安静"]) ? "深夜歌单" : "最近常听";
  const playlist: CharacterPhoneMusicPlaylist = {
    id: scopedId(phone.id, "playlist", "daily"),
    name: playlistName,
    trackIds: musicTracks.map((track) => track.id),
    source: sourceLibrary.length > 0 ? "user-library" : "generated",
  };
  const preservedPlaylists = (phone.musicPlaylists ?? [])
    .filter((candidate) => candidate.name !== playlistName)
    .map((candidate) => ({
      ...candidate,
      trackIds: candidate.trackIds
        .map((trackId) => persistedTrackIdMap.get(trackId) || trackId)
        .filter((trackId) => musicTracks.some((track) => track.id === trackId)),
    }))
    .filter((candidate) => candidate.trackIds.length > 0);
  return { musicTracks, listeningHistory: history, musicPlaylists: musicTracks.length > 0 ? [playlist, ...preservedPlaylists] : preservedPlaylists };
}

function isLegacyMusicTrack(track: CharacterPhoneMusicTrack): boolean {
  return !track.sourceTrackId && LEGACY_MUSIC_TITLES.has(track.title);
}

function syncMoments(
  phone: CharacterPhoneRecord,
  character: Character,
  characters: Character[],
  activeIdentity: UserIdentity | undefined,
  moments: Moment[],
  contacts: CharacterPhoneContact[],
  relationshipNetworkContacts: CharacterPhoneRelationshipNetworkContact[],
): { posts: CharacterPhonePost[]; lastMomentId?: string } {
  const contactNames = new Set(contacts.filter((contact) => contact.isNpc).map((contact) => contact.name));
  const networkNpcIds = new Set(relationshipNetworkContacts.map((contact) => contact.npc.id));
  const networkCharacterIds = new Set(relationshipNetworkContacts.map((contact) => contact.linkedCharacterId).filter(Boolean));
  const relatedCharacterIds = new Set(
    characters.filter((candidate) => contactNames.has(candidate.name)).map((candidate) => candidate.id),
  );
  const linkedCommentCharacterIds = new Set([
    character.id,
    ...relatedCharacterIds,
    ...networkCharacterIds,
  ]);
  const linkedCommentNames = new Set([
    character.name,
    ...contacts.filter((contact) => contact.isNpc).map((contact) => contact.name),
  ]);
  const isVisibleComment = (comment: Moment["comments"][number]) => {
    if (comment.characterId) return linkedCommentCharacterIds.has(comment.characterId);
    // User comments belong to the active owner's social circle. If a legacy
    // comment has no character id but uses a known unlinked character name,
    // keep it out of the role phone as well.
    const knownUnlinkedCharacter = characters.some((candidate) =>
      candidate.id !== character.id
      && candidate.name === comment.authorName
      && !linkedCommentCharacterIds.has(candidate.id),
    );
    return !knownUnlinkedCharacter || linkedCommentNames.has(comment.authorName);
  };
  const relevant = moments.filter((moment) => {
    const belongsToOwner = (moment.ownerIdentityId || "identity-1") === phone.ownerIdentityId;
    if (!belongsToOwner) return false;
    // A role's own phone can always display its private posts, while private or
    // user-only posts from everyone else stay out of this phone's social feed.
    if ((moment.visibility || "public") !== "public" && moment.characterId !== character.id) {
      if (moment.visibility !== "specific" || !moment.visibilityTargetIds?.includes(character.id)) return false;
    }
    if (moment.characterId === character.id) return true;
    if (!moment.characterId) return !activeIdentity?.id || moment.ownerIdentityId === activeIdentity.id;
    return Boolean(moment.relationshipNetworkNpcId && networkNpcIds.has(moment.relationshipNetworkNpcId))
      || relatedCharacterIds.has(moment.characterId)
      || networkCharacterIds.has(moment.characterId)
      || contactNames.has(moment.authorName);
  });
  const sourcePosts = relevant.map((moment) => {
    const isUserPost = !moment.characterId;
    return {
    id: scopedId(phone.id, "moment", `source-${moment.id}`),
    author: moment.authorName,
    authorId: moment.characterId,
    authorAvatar: isUserPost ? (activeIdentity?.avatar || moment.authorAvatar) : moment.authorAvatar,
    content: moment.content,
    timestamp: moment.timestamp,
    likes: moment.likes.length,
    comments: moment.comments.filter(isVisibleComment).map((comment) => comment.content),
    commentDetails: moment.comments.filter(isVisibleComment).map((comment): CharacterPhonePostComment => ({
      id: comment.id,
      authorName: comment.authorName,
      content: comment.content,
      timestamp: comment.timestamp,
      authorId: comment.characterId,
      authorAvatar: comment.authorAvatar,
      relationId: comment.relationId,
      sourceNpcId: comment.sourceNpcId,
    })),
    source: moment.characterId === character.id ? "generated" as const : !moment.characterId ? "user" as const : "npc" as const,
    sourceMomentId: moment.id,
    visibility: moment.visibility || "public",
    visibilityTargetIds: moment.visibilityTargetIds,
    };
  });
  const existingSourceIds = new Set((phone.posts ?? []).map((post) => post.sourceMomentId).filter(Boolean));
  const mirroredPhonePostIds = new Set(
    relevant
      .map((moment) => moment.sourceCharacterPhonePostId)
      .filter((id): id is string => Boolean(id) && (phone.posts ?? []).some((post) => post.id === id)),
  );
  const newPosts = sourcePosts.filter((post) => {
    const mirroredSourceId = relevant.find((moment) => moment.id === post.sourceMomentId)?.sourceCharacterPhonePostId;
    return !existingSourceIds.has(post.sourceMomentId)
      && !(mirroredSourceId && mirroredPhonePostIds.has(mirroredSourceId));
  });
  const refreshedExistingPosts = (phone.posts ?? []).map((post) => {
    const sourcePost = sourcePosts.find((candidate) => candidate.sourceMomentId === post.sourceMomentId);
    if (!sourcePost) return post;
    return {
      ...post,
      author: sourcePost.author,
      authorId: sourcePost.authorId,
      authorAvatar: sourcePost.authorAvatar,
      content: sourcePost.content,
      timestamp: sourcePost.timestamp,
      likes: sourcePost.likes,
      comments: sourcePost.comments,
      commentDetails: sourcePost.commentDetails,
      visibility: sourcePost.visibility,
      visibilityTargetIds: sourcePost.visibilityTargetIds,
    };
  });
  return {
    posts: [...refreshedExistingPosts, ...newPosts].sort((left, right) => right.timestamp - left.timestamp),
    lastMomentId: relevant.slice().sort((left, right) => left.timestamp - right.timestamp).at(-1)?.id,
  };
}

function removeLegacyPresetContent(phone: CharacterPhoneRecord): CharacterPhoneRecord {
  const hasScopedSeed = (id: string, kind: string) => id.includes(`:${kind}:seed-`);
  const isLegacyGenerated = (id: string) => id.startsWith("phone-generated-") || id.startsWith("phone-message-");
  const isLegacyContact = (id: string) => id.startsWith("phone-contact-") || id.includes(":contact:generated-");
  const isLegacyBrowserEntry = (id: string) => hasScopedSeed(id, "search")
    || (id.startsWith("phone-search-") && !id.startsWith("phone-search-user-"));
  const isLegacyDiaryEntry = (id: string) => hasScopedSeed(id, "diary")
    || id.includes(":diary:private-")
    || (id.startsWith("phone-diary-") && !id.startsWith("phone-diary-user-"));
  const isLegacyScheduleItem = (id: string) => hasScopedSeed(id, "schedule") || id.startsWith("phone-schedule-");
  const isLegacyNote = (id: string) => hasScopedSeed(id, "note") || id.startsWith("phone-note-");
  const isLegacyTodo = (id: string) => hasScopedSeed(id, "todo") || id.startsWith("phone-todo-");
  const isLegacyPost = (id: string) => hasScopedSeed(id, "moment")
    || id.includes(":moment:character-1")
    || (id.startsWith("phone-post-") && !id.startsWith("phone-post-user-"));
  const legacyContactIds = new Set(
    phone.contacts
      .filter((contact) => isLegacyContact(contact.id) && contact.source !== "user")
      .filter((contact) => !(phone.threadMessages ?? []).some((message) => message.contactId === contact.id && (message.operatedByUser || message.sourceMessageId)))
      .map((contact) => contact.id),
  );
  const retainedMusicTracks = (phone.musicTracks ?? []).filter((track) => !isLegacyMusicTrack(track));
  const retainedMusicTrackIds = new Set(retainedMusicTracks.map((track) => track.id));
  return {
    ...phone,
    // These IDs belonged to the old demo fallback. User-authored messages and
    // awareness alerts use different IDs and are intentionally preserved.
    messages: phone.messages.filter((message) => !isLegacyGenerated(message.id) || message.id.startsWith("phone-message-user-")),
    contacts: phone.contacts.filter((contact) => !legacyContactIds.has(contact.id)),
    threadMessages: phone.threadMessages.filter((message) => {
      const isLegacyMessage = hasScopedSeed(message.id, "message")
        || message.id.includes(":message:legacy-")
        || message.id.startsWith("phone-thread-message-")
        || isLegacyGenerated(message.id)
        || legacyContactIds.has(message.contactId);
      return !isLegacyMessage || Boolean(message.operatedByUser || message.sourceMessageId);
    }),
    browserHistory: phone.browserHistory.filter((entry) => !isLegacyBrowserEntry(entry.id) && !isLegacyGenerated(entry.id)),
    diaryEntries: phone.diaryEntries.filter((entry) => !isLegacyDiaryEntry(entry.id) && !isLegacyGenerated(entry.id)),
    notes: (phone.notes ?? []).filter((note) => !isLegacyNote(note.id) && !isLegacyGenerated(note.id)),
    todos: (phone.todos ?? []).filter((todo) => !isLegacyTodo(todo.id) && !isLegacyGenerated(todo.id)),
    scheduleItems: phone.scheduleItems.filter((entry) => !isLegacyScheduleItem(entry.id) && !isLegacyGenerated(entry.id)),
    // Old demo gallery items used phone-gallery-* without a real asset. Keep
    // received photos and any real/generated image that has an asset or a
    // locally rendered text-image representation.
    galleryItems: phone.galleryItems.filter((item) => item.source !== "generated"
      || !item.id.startsWith("phone-gallery-")
      || Boolean(item.imageAssetId || item.dataUrl || item.textImageForId)),
    posts: phone.posts.filter((post) => !isLegacyPost(post.id) && !isLegacyGenerated(post.id)),
    musicTracks: retainedMusicTracks,
    listeningHistory: (phone.listeningHistory ?? []).filter((record) => retainedMusicTrackIds.has(record.trackId)),
    musicPlaylists: (phone.musicPlaylists ?? [])
      .map((playlist) => ({ ...playlist, trackIds: playlist.trackIds.filter((trackId) => retainedMusicTrackIds.has(trackId)) }))
      .filter((playlist) => playlist.trackIds.length > 0),
  };
}

function normalizeDiaryEntries(entries: CharacterPhoneRecord["diaryEntries"]): CharacterPhoneRecord["diaryEntries"] {
  const seenGenerated = new Set<string>();
  return entries
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
    .filter((entry) => {
      // User-written entries are always preserved. Older generated fallback
      // runs could add the same private note repeatedly, so collapse only
      // exact generated duplicates during the next phone sync.
      if (entry.id.startsWith("phone-diary-user-")) return true;
      const key = `${entry.hidden ? "hidden" : "visible"}|${entry.title}|${entry.body}`;
      if (seenGenerated.has(key)) return false;
      seenGenerated.add(key);
      return true;
    });
}

function normalizeGalleryItems(items: CharacterPhoneRecord["galleryItems"]): CharacterPhoneRecord["galleryItems"] {
  const seenGenerated = new Set<string>();
  return items
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
    .filter((item) => {
      // Never collapse user photos, real stored assets, or locally rendered
      // text images. Only exact generated placeholders are deduplicated.
      if (item.source === "user" || item.imageAssetId || item.dataUrl || item.textImageForId) return true;
      const key = `${item.source || "generated"}|${item.title}|${item.caption}`;
      if (seenGenerated.has(key)) return false;
      seenGenerated.add(key);
      return true;
    });
}

export function normalizeCharacterPhoneMessages(messages: CharacterPhoneMessage[]): CharacterPhoneMessage[] {
  const seenGenerated = new Set<string>();
  return messages.filter((message) => {
    // Phone discovery/awareness messages are generated records. Older test
    // runs could append the same alert once per detected action, so keep the
    // first exact copy while preserving every normal/user-authored message.
    const isGeneratedAlert = message.id.startsWith("phone-discovery-") || message.id.startsWith("phone-awareness-");
    if (!isGeneratedAlert) return true;
    const key = `${message.sender}|${message.body}`;
    if (seenGenerated.has(key)) return false;
    seenGenerated.add(key);
    return true;
  });
}

export function hasCompleteCharacterPhoneContactThread(
  phone: CharacterPhoneRecord,
  contactId: string,
): boolean {
  const messages = (phone.threadMessages ?? []).filter((message) => message.contactId === contactId);
  return messages.some((message) => message.sender === "contact")
    && messages.some((message) => message.sender === "character");
}

export function hasMissingCharacterPhoneContactThreads(phone: CharacterPhoneRecord): boolean {
  return (phone.contacts ?? []).some((contact) => !contact.removedAt
    && contact.source !== "user"
    && contact.kind !== "user"
    && Boolean(contact.sourceRefs?.length || contact.linkedCharacterId || contact.relationshipNetworkNpcId)
    && !hasCompleteCharacterPhoneContactThread(phone, contact.id));
}

export function normalizeCharacterPhoneProactiveMessages(messages: Message[]): Message[] {
  const seenGenerated = new Set<string>();
  return messages.filter((message) => {
    const isGeneratedAlert = message.id.startsWith("phone-proactive-")
      || message.id.startsWith("phone-awareness-")
      || message.id.startsWith("phone-operation-alert-");
    if (!isGeneratedAlert) return true;
    const key = `${message.characterId}|${message.relationId || ""}|${message.conversationId || ""}|${message.sender}|${message.content}`;
    if (seenGenerated.has(key)) return false;
    seenGenerated.add(key);
    return true;
  });
}

export function normalizeCharacterPhoneBrowserHistory(entries: CharacterPhoneRecord["browserHistory"]): CharacterPhoneRecord["browserHistory"] {
  const seenGenerated = new Set<string>();
  return entries
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
    .filter((entry) => {
      // Keep user-created searches, including repeated searches. Older
      // generated runs could append the same title repeatedly, so collapse
      // duplicates from generated history after conservative whitespace/case
      // normalization. User-created searches remain untouched.
      if (entry.id.startsWith("phone-search-user-")) return true;
      const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
      const key = `${normalize(entry.query)}|${normalize(entry.title)}`;
      if (seenGenerated.has(key)) return false;
      seenGenerated.add(key);
      return true;
    });
}

function normalizeScheduleItems(entries: CharacterPhoneRecord["scheduleItems"]): CharacterPhoneRecord["scheduleItems"] {
  const seenGenerated = new Set<string>();
  return entries
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp)
    .filter((entry) => {
      // User-created schedule items use the character-phone-schedule prefix;
      // preserve them even when the same title is intentionally reused.
      if (entry.id.startsWith("character-phone-schedule-")) return true;
      const key = `${entry.title}|${entry.detail}`;
      if (seenGenerated.has(key)) return false;
      seenGenerated.add(key);
      return true;
    });
}

export function ensureCharacterPhoneContent(input: CharacterPhoneContentInput): CharacterPhoneRecord {
  const now = input.now ?? Date.now();
  const sourcePhone = removeLegacyPresetContent(input.phone);

  // Clearing a role phone is intentionally destructive. Do not immediately
  // recreate the deleted records by projecting the main phone's chat,
  // moments, and contacts during the next open/generation pass. The marker is
  // released only after a successful first-life generation has established a
  // new phone-local baseline.
  const sourceHydrationSuppressed = Boolean(
    sourcePhone.sourceHydrationSuppressedAt
      && (!sourcePhone.initialContentGeneratedAt
        || sourcePhone.sourceHydrationSuppressedAt > sourcePhone.initialContentGeneratedAt),
  );
  const relationshipNetworkContacts = listCharacterPhoneRelationshipNetworkContacts({
    character: input.character,
    ownerIdentityId: sourcePhone.ownerIdentityId,
    characters: input.characters,
    npcs: input.relationshipNetworkNpcs || [],
    maps: input.relationshipNetworkMaps || [],
  });
  if (sourceHydrationSuppressed) {
    // A cleared phone must not resurrect old records, but an explicitly
    // linked relationship-network NPC is fresh evidence and must remain
    // available for the next first-life generation.
    const evidenceContacts = (sourcePhone.contacts ?? []).length > 0
      ? sourcePhone.contacts ?? []
      : buildRelationshipNetworkPhoneContacts(sourcePhone, relationshipNetworkContacts);
    const isolated: CharacterPhoneRecord = {
      ...sourcePhone,
      messages: normalizeCharacterPhoneMessages(sourcePhone.messages),
      contacts: evidenceContacts,
      threadMessages: sourcePhone.threadMessages ?? [],
      posts: sourcePhone.posts ?? [],
      browserHistory: normalizeCharacterPhoneBrowserHistory(sourcePhone.browserHistory),
      diaryEntries: normalizeDiaryEntries(sourcePhone.diaryEntries),
      galleryItems: normalizeGalleryItems(sourcePhone.galleryItems),
      scheduleItems: normalizeScheduleItems(sourcePhone.scheduleItems),
      notes: sourcePhone.notes ?? [],
      todos: sourcePhone.todos ?? [],
      phoneCalls: sourcePhone.phoneCalls ?? [],
      musicTracks: sourcePhone.musicTracks ?? [],
      listeningHistory: sourcePhone.listeningHistory ?? [],
      musicPlaylists: sourcePhone.musicPlaylists ?? [],
      updatedAt: sourcePhone.updatedAt,
    };
    const changed = JSON.stringify(isolated) !== JSON.stringify(input.phone);
    return changed ? { ...isolated, updatedAt: now } : input.phone;
  }

  const seeded = Boolean(sourcePhone.contentSeededAt);
  const lifeContext = buildCharacterPhoneLifeContext({
    phone: sourcePhone,
    character: input.character,
    characters: input.characters,
    activeIdentity: input.activeIdentity,
    relationships: input.relationships,
    messages: input.messages,
    moments: input.moments,
    worldBookEntries: input.worldBookEntries,
    relationshipNetworkContacts,
    identities: input.identities,
  });
  const context = buildContext(input.character, lifeContext.worldBookEntries);
  const scopedInput = {
    ...input,
    phone: sourcePhone,
    activeIdentity: lifeContext.activeIdentity,
    relationships: lifeContext.relationships,
    messages: lifeContext.messages,
    moments: lifeContext.moments,
    worldBookEntries: lifeContext.worldBookEntries,
  };
  const syncedContacts = syncContacts(scopedInput);
  const contacts = syncedContacts.contacts;
  const userContacts = contacts.filter((contact) => isUserPhoneContact(contact) && !contact.historyOnly);
  const chat = syncUserChat({ ...sourcePhone, threadMessages: syncedContacts.threadMessages }, input.character, userContacts, lifeContext.messages, lifeContext.relationships, input.characters);
  // During first-life initialization the generator owns the conversation
  // history. Do not seed every contact with the same generic one-line opener;
  // that makes every chat look identical and leaves no character reply.
  const contactThreads = sourcePhone.initialContentPending
    ? { contacts, threadMessages: chat.threadMessages }
    : syncContactThreads(sourcePhone, contacts, chat.threadMessages, now);
  const moments = syncMoments(sourcePhone, input.character, input.characters, lifeContext.activeIdentity, lifeContext.moments, contactThreads.contacts, relationshipNetworkContacts);
  const music = syncMusic(sourcePhone, input.musicTracks, context);

  let next: CharacterPhoneRecord = {
    ...sourcePhone,
    messages: normalizeCharacterPhoneMessages(sourcePhone.messages),
    contacts: contactThreads.contacts,
    threadMessages: contactThreads.threadMessages,
    posts: moments.posts,
    musicTracks: music.musicTracks,
    listeningHistory: music.listeningHistory,
    musicPlaylists: music.musicPlaylists,
    browserHistory: normalizeCharacterPhoneBrowserHistory(sourcePhone.browserHistory),
    diaryEntries: normalizeDiaryEntries(sourcePhone.diaryEntries),
    galleryItems: normalizeGalleryItems(sourcePhone.galleryItems),
    scheduleItems: normalizeScheduleItems(sourcePhone.scheduleItems),
    updatedAt: sourcePhone.updatedAt,
    lastSyncedMessageId: chat.lastMessageId,
    lastSyncedMomentId: moments.lastMomentId ?? sourcePhone.lastSyncedMomentId,
  };

  if (!seeded) {
    next = {
      ...next,
      contentSeededAt: now,
    };
  }

  const changed = JSON.stringify(next) !== JSON.stringify(input.phone);
  return changed ? { ...next, updatedAt: now } : input.phone;
}
