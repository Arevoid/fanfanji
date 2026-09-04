import type {
  Character,
  Message,
  Moment,
  UserIdentity,
  WorldBookEntry,
  MusicTrack,
} from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import type {
  CharacterPhoneContact,
  CharacterPhoneMessage,
  CharacterPhonePost,
  CharacterPhoneRecord,
  CharacterPhoneMusicPlaylist,
  CharacterPhoneMusicTrack,
  CharacterPhoneListeningRecord,
  CharacterPhoneThreadMessage,
} from "../../domain/characterPhone/types";

export interface CharacterPhoneContentInput {
  phone: CharacterPhoneRecord;
  character: Character;
  characters: Character[];
  activeIdentity?: UserIdentity;
  relationships: CharacterRelationship[];
  messages: Message[];
  moments: Moment[];
  worldBookEntries: WorldBookEntry[];
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

function relevantWorldBookEntries(entries: WorldBookEntry[], characterId: string): WorldBookEntry[] {
  return entries.filter((entry) => entry.isActive !== false
    && (!entry.characterId
      || entry.characterId === "global"
      || entry.characterId === characterId
      || entry.characterIds?.includes(characterId)));
}

function buildContext(character: Character, entries: WorldBookEntry[]): string {
  return [
    character.name,
    character.personality,
    character.backstory,
    ...relevantWorldBookEntries(entries, character.id).flatMap((entry) => [entry.title, entry.content]),
  ].filter(Boolean).join(" ").toLowerCase();
}

function buildRawContext(character: Character, entries: WorldBookEntry[]): string {
  return [
    character.personality,
    character.backstory,
    ...relevantWorldBookEntries(entries, character.id).flatMap((entry) => [entry.title, entry.content]),
  ].filter(Boolean).join("\n");
}

function toCharacterMessage(message: Message, phoneId: string, contactId: string): CharacterPhoneThreadMessage {
  return {
    id: scopedId(phoneId, "message", message.id),
    contactId,
    sender: message.sender === "character" ? "character" : "contact",
    content: message.content,
    timestamp: message.timestamp,
    sourceMessageId: message.id,
  };
}

function isCurrentUserMessage(
  message: Message,
  characterId: string,
  relationIds: Set<string>,
): boolean {
  return message.characterId === characterId && (!message.relationId || relationIds.has(message.relationId));
}

function makeUserContact(phone: CharacterPhoneRecord, identity?: UserIdentity): CharacterPhoneContact {
  return {
    id: scopedId(phone.id, "contact", "user"),
    name: identity?.name?.trim() || "用户",
    relation: "与角色聊天",
    isLongTerm: true,
    isNpc: false,
    avatar: identity?.avatar,
    source: "user",
  };
}

function buildContextContacts(
  phone: CharacterPhoneRecord,
  character: Character,
  entries: WorldBookEntry[],
): CharacterPhoneContact[] {
  const rawContext = buildRawContext(character, entries);
  const candidates: Array<{ name: string; relation: string }> = [];
  const addCandidate = (name: string, relation: string) => {
    const normalizedName = name.replace(/[“”‘’"']/g, "").trim();
    if (normalizedName.length < 2 || normalizedName.length > 16) return;
    if (normalizedName === character.name || candidates.some((candidate) => candidate.name === normalizedName)) return;
    candidates.push({ name: normalizedName, relation });
  };
  const relationPattern = /(?:家人|父亲|母亲|爸爸|妈妈|哥哥|姐姐|弟弟|妹妹|朋友|好友|同事|同学|老师|上司|邻居|前任|恋人|队友|搭档)\s*[：:]\s*([^\n。；;,，]+)/g;
  for (const match of rawContext.matchAll(relationPattern)) {
    const label = match[0].split(/[：:]/)[0]?.trim() || "联系人";
    match[1].split(/[、，,及和与]/).forEach((name) => addCandidate(name, label));
  }
  const describedRelationPattern = /([A-Za-z\u4e00-\u9fff·]{2,16})\s*(?:是|为)[^\n。；;]{0,12}(家人|朋友|好友|同事|同学|老师|上司|邻居|前任|恋人|队友|搭档)/g;
  for (const match of rawContext.matchAll(describedRelationPattern)) addCandidate(match[1], match[2]);

  const existingNames = new Set((phone.contacts ?? []).map((contact) => contactKey(contact.name)));
  return candidates
    .filter((candidate) => !existingNames.has(contactKey(candidate.name)) && candidate.name !== character.name)
    .map((candidate, index) => ({
      id: scopedId(phone.id, "contact", `context-${candidate.name}`),
      name: candidate.name,
      relation: candidate.relation,
      isLongTerm: index === 0,
      isNpc: true,
      source: "generated" as const,
    }));
}

function syncContacts(input: CharacterPhoneContentInput): CharacterPhoneContact[] {
  const userContact = makeUserContact(input.phone, input.activeIdentity);
  // Keep removed contacts in the record. They are a soft-unlink: the contact
  // disappears from the visible inbox but its old thread and deletion fact
  // must remain available to the character's later reactions.
  const existing = input.phone.contacts ?? [];
  const normalizedExisting = existing
    .filter((contact) => contact.id !== userContact.id)
    .map((contact) => ({ ...contact, source: contact.source ?? (contact.isNpc ? "linked" : "user") }));
  const linkedIds = new Set(
    input.characters
      .filter((candidate) => candidate.id !== input.character.id && !candidate.isGroupChat)
      .filter((candidate) => {
        const context = buildContext(input.character, input.worldBookEntries);
        return context.includes(candidate.name.toLocaleLowerCase())
          || normalizedExisting.some((contact) => contact.name === candidate.name);
      })
      .map((candidate) => candidate.id),
  );
  const linkedContacts = input.characters
    .filter((candidate) => linkedIds.has(candidate.id))
    .filter((candidate) => !normalizedExisting.some((contact) => contact.name === candidate.name))
    .map((candidate) => ({
      id: scopedId(input.phone.id, "contact", `linked-${candidate.id}`),
      name: candidate.name,
      relation: "与角色有关联的联系人",
      isLongTerm: true,
      isNpc: true,
      avatar: candidate.avatar,
      source: "linked" as const,
    }));
  const generated = buildContextContacts(input.phone, input.character, input.worldBookEntries);
  return [userContact, ...normalizedExisting, ...linkedContacts, ...generated];
}

function syncUserChat(
  phone: CharacterPhoneRecord,
  character: Character,
  userContact: CharacterPhoneContact,
  messages: Message[],
  relations: CharacterRelationship[],
): { threadMessages: CharacterPhoneThreadMessage[]; lastMessageId?: string } {
  const relationIds = new Set(relations.filter((relation) => relation.characterId === character.id).map((relation) => relation.id));
  const sourceMessages = messages
    .filter((message) => isCurrentUserMessage(message, character.id, relationIds))
    // Phone-generated notifications are persisted in the main chat for
    // awareness reactions, but they are not part of the user's real thread
    // mirror and must not be copied back as ordinary chat history.
    .filter((message) => !message.id.startsWith("phone-proactive-"))
    .sort((left, right) => left.timestamp - right.timestamp);
  const existing = (phone.threadMessages ?? []).filter((message) => message.contactId !== userContact.id);
  const synced = sourceMessages.map((message) => toCharacterMessage(message, phone.id, userContact.id));
  const existingSynced = (phone.threadMessages ?? []).filter((message) => message.contactId === userContact.id && message.sourceMessageId);
  const bySourceId = new Map(existingSynced.map((message) => [message.sourceMessageId, message]));
  const merged = synced.map((message) => bySourceId.get(message.sourceMessageId || "") || message);
  const fallback = phone.threadMessages?.some((message) => message.contactId === userContact.id)
    ? phone.threadMessages.filter((message) => message.contactId === userContact.id)
    : [];
  const threadMessages = sourceMessages.length > 0 ? [...existing, ...merged] : [...existing, ...fallback];
  return {
    threadMessages: threadMessages.sort((left, right) => left.timestamp - right.timestamp),
    lastMessageId: sourceMessages.at(-1)?.id,
  };
}

function syncMusic(
  phone: CharacterPhoneRecord,
  sourceTracks: MusicTrack[] | undefined,
  context: string,
): { musicTracks: CharacterPhoneMusicTrack[]; listeningHistory: CharacterPhoneListeningRecord[]; musicPlaylists: CharacterPhoneMusicPlaylist[] } {
  const source = sourceTracks && sourceTracks.length > 0
    ? sourceTracks.slice(0, 12)
    : (phone.musicTracks?.length ? phone.musicTracks : []);
  const musicTracks = source.map((track, index) => {
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
  const history = phone.listeningHistory?.length
    ? phone.listeningHistory.filter((record) => musicTracks.some((track) => track.id === record.trackId))
    : [];
  const playlist: CharacterPhoneMusicPlaylist = {
    id: scopedId(phone.id, "playlist", "daily"),
    name: includesAny(context, ["夜", "夜晚", "失眠", "安静"]) ? "深夜歌单" : "最近常听",
    trackIds: musicTracks.map((track) => track.id),
    source: sourceTracks && sourceTracks.length > 0 ? "user-library" : "generated",
  };
  return { musicTracks, listeningHistory: history, musicPlaylists: musicTracks.length > 0 ? [playlist] : [] };
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
): { posts: CharacterPhonePost[]; lastMomentId?: string } {
  const contactNames = new Set(contacts.filter((contact) => contact.isNpc).map((contact) => contact.name));
  const relatedCharacterIds = new Set(
    characters.filter((candidate) => contactNames.has(candidate.name)).map((candidate) => candidate.id),
  );
  const relevant = moments.filter((moment) => {
    if (moment.characterId === character.id) return true;
    if (!moment.characterId) return !activeIdentity?.id || !moment.ownerIdentityId || moment.ownerIdentityId === activeIdentity.id;
    return relatedCharacterIds.has(moment.characterId) || contactNames.has(moment.authorName);
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
    comments: moment.comments.map((comment) => comment.content),
    source: moment.characterId === character.id ? "generated" as const : !moment.characterId ? "user" as const : "npc" as const,
    sourceMomentId: moment.id,
    };
  });
  const existingSourceIds = new Set((phone.posts ?? []).map((post) => post.sourceMomentId).filter(Boolean));
  const newPosts = sourcePosts.filter((post) => !existingSourceIds.has(post.sourceMomentId));
  const refreshedExistingPosts = (phone.posts ?? []).map((post) => {
    const sourcePost = sourcePosts.find((candidate) => candidate.sourceMomentId === post.sourceMomentId);
    return sourcePost?.source === "user" && sourcePost.authorAvatar
      ? { ...post, author: sourcePost.author, authorAvatar: sourcePost.authorAvatar }
      : post;
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
      // only exact duplicates from generated history.
      if (entry.id.startsWith("phone-search-user-")) return true;
      const key = `${entry.query}|${entry.title}`;
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
  const seeded = Boolean(sourcePhone.contentSeededAt);
  const context = buildContext(input.character, input.worldBookEntries);
  const scopedInput = { ...input, phone: sourcePhone };
  const contacts = syncContacts(scopedInput);
  const userContact = contacts[0];
  const relationIds = input.relationships
    .filter((relation) => relation.userIdentityId === sourcePhone.ownerIdentityId && relation.characterId === input.character.id)
    .map((relation) => relation.id);
  const chat = syncUserChat(sourcePhone, input.character, userContact, input.messages, input.relationships.filter((relation) => relationIds.includes(relation.id)));
  const moments = syncMoments(sourcePhone, input.character, input.characters, input.activeIdentity, input.moments, contacts);
  const music = syncMusic(sourcePhone, input.musicTracks, context);

  let next: CharacterPhoneRecord = {
    ...sourcePhone,
    messages: normalizeCharacterPhoneMessages(sourcePhone.messages),
    contacts,
    threadMessages: chat.threadMessages,
    posts: moments.posts,
    musicTracks: music.musicTracks,
    listeningHistory: music.listeningHistory,
    musicPlaylists: music.musicPlaylists,
    browserHistory: normalizeCharacterPhoneBrowserHistory(sourcePhone.browserHistory),
    diaryEntries: normalizeDiaryEntries(sourcePhone.diaryEntries),
    galleryItems: normalizeGalleryItems(sourcePhone.galleryItems),
    scheduleItems: normalizeScheduleItems(sourcePhone.scheduleItems),
    updatedAt: sourcePhone.updatedAt,
    lastSyncedMessageId: chat.lastMessageId ?? sourcePhone.lastSyncedMessageId,
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
