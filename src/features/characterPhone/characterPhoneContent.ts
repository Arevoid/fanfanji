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
  CharacterPhoneDiaryEntry,
  CharacterPhoneMessage,
  CharacterPhoneNote,
  CharacterPhonePost,
  CharacterPhoneRecord,
  CharacterPhoneMusicPlaylist,
  CharacterPhoneMusicTrack,
  CharacterPhoneListeningRecord,
  CharacterPhoneScheduleItem,
  CharacterPhoneThreadMessage,
  CharacterPhoneTodo,
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

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_MUSIC_LIBRARY = [
  { id: "night-mood", title: "Night Mood", artist: "角色的深夜歌单", duration: "4:39" },
  { id: "quiet-city-lights", title: "Quiet City Lights", artist: "City Pop Radio", duration: "3:58" },
  { id: "soft-rain", title: "Soft Rain", artist: "The Evening Tapes", duration: "5:12" },
  { id: "first-light", title: "First Light", artist: "Sunday Morning", duration: "3:41" },
];

function scopedId(phoneId: string, kind: string, key: string): string {
  return `character-phone:${phoneId}:${kind}:${key}`;
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
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

function contextPhrase(character: Character, context: string): string {
  const source = [character.personality, character.backstory, context]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const phrase = source.split(/[。！？.!?]/)[0]?.trim();
  return (phrase || `${character.name}的近况`).slice(0, 32);
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

function buildGeneratedContacts(
  phone: CharacterPhoneRecord,
  character: Character,
  context: string,
): CharacterPhoneContact[] {
  const relationshipLabel = includesAny(context, ["同事", "公司", "工作", "学校", "老师", "同学"])
    ? "工作或学习上的联系人"
    : includesAny(context, ["家人", "妹妹", "姐姐", "哥哥", "父亲", "母亲"])
      ? "家人"
      : "认识很久的朋友";
  const candidates = [
    { name: "林晓", relation: relationshipLabel },
    { name: "周岚", relation: includesAny(context, ["任务", "组织", "行动", "秘密"]) ? "一起处理事情的人" : "偶尔联系的人" },
  ];
  const existingNames = new Set((phone.contacts ?? []).map((contact) => contact.name));
  return candidates
    .filter((candidate) => !existingNames.has(candidate.name) && candidate.name !== character.name)
    .map((candidate, index) => ({
      id: scopedId(phone.id, "contact", `generated-${index}`),
      name: candidate.name,
      relation: candidate.relation,
      isLongTerm: index === 0,
      isNpc: true,
      source: "generated" as const,
    }));
}

function syncContacts(input: CharacterPhoneContentInput, seeded: boolean): CharacterPhoneContact[] {
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
        const name = candidate.name.toLowerCase();
        const context = buildContext(input.character, input.worldBookEntries);
        return context.includes(name) || normalizedExisting.some((contact) => contact.name === candidate.name);
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
  const generated = seeded ? buildGeneratedContacts(input.phone, input.character, buildContext(input.character, input.worldBookEntries)) : [];
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

function createSeedDiary(phoneId: string, character: Character, now: number, context: string): CharacterPhoneDiaryEntry[] {
  const phrase = contextPhrase(character, context);
  const privateThought = includesAny(context, ["敏感", "克制", "沉默", "孤独"])
    ? `${phrase}。明明已经想好要说什么，真正面对那个人的时候，还是把话咽了回去。`
    : `今天仍在处理“${phrase}”带来的情绪，只有那句想说的话，还停在输入框里。`;
  return [
    { id: scopedId(phoneId, "diary", "private-1"), title: `${character.name}没有说出口的话`, body: privateThought, timestamp: now - 4 * 60 * 60 * 1000 },
    { id: scopedId(phoneId, "diary", "private-2"), title: `只留给${character.name}的记录`, body: `${phrase}。这段记录不想让任何人看见，至少现在还不能急着给它下结论。`, timestamp: now - DAY, hidden: true },
  ];
}

function createSeedPosts(phoneId: string, character: Character, now: number, context: string): CharacterPhonePost[] {
  const content = includesAny(context, ["旅行", "城市", "在外", "住在"])
    ? "路过一个没在地图上标记出来的地方，风很大，刚好适合把一些事想清楚。"
    : "有些心情不适合发给特定的人，只适合留在这里。";
  return [
    {
      id: scopedId(phoneId, "moment", "character-1"),
      author: character.name,
      authorId: character.id,
      content,
      timestamp: now - 2 * 60 * 60 * 1000,
      likes: 1,
      comments: [],
      source: "generated",
      authorAvatar: character.avatar,
    },
  ];
}

function createSeedBrowserHistory(phoneId: string, character: Character, now: number, context: string) {
  const phrase = contextPhrase(character, context);
  const entries = includesAny(context, ["工作", "公司", "学校", "任务"])
    ? [
        [`${character.name} 明天如何安排 ${phrase}`, `关于${phrase}的安排`],
        [`${phrase} 附近安静适合工作的地方`, `适合${phrase}的安静地点`],
        [`${character.name} 如何在忙碌时保持专注`, `${character.name}的专注方法`],
      ]
    : [
        [`${character.name} 适合一个人去哪里`, `适合${character.name}的安静路线`],
        [`${phrase} 会让人开心吗`, `关于${phrase}的相处方式`],
        [`${character.name} 最近为什么睡不着`, `${character.name}的夜晚记录`],
      ];
  return entries.map(([query, title], index) => ({
    id: scopedId(phoneId, "search", `seed-${index}`),
    query,
    title,
    timestamp: now - (index + 1) * 2 * 60 * 60 * 1000,
  }));
}

function createSeedSchedule(phoneId: string, character: Character, now: number, context: string): CharacterPhoneScheduleItem[] {
  const phrase = contextPhrase(character, context);
  const firstTitle = includesAny(context, ["工作", "公司", "学校", "上班"])
    ? `${character.name}的工作或学习安排`
    : `整理与${phrase}有关的事情`;
  return [
    { id: scopedId(phoneId, "schedule", "seed-today"), title: firstTitle, detail: `按${character.name}的日常节奏处理这件事。`, timestamp: now + 3 * 60 * 60 * 1000 },
    { id: scopedId(phoneId, "schedule", "seed-evening"), title: `${character.name}的个人时间`, detail: `给${character.name}留一点不被打扰的时间。`, timestamp: now + 7 * 60 * 60 * 1000 },
    { id: scopedId(phoneId, "schedule", "seed-next"), title: `${character.name}需要提前准备的事`, detail: `与${phrase}有关的一件待办。`, timestamp: now + DAY + 10 * 60 * 60 * 1000 },
  ];
}

function createSeedNotes(phoneId: string, character: Character, context: string, now: number): { notes: CharacterPhoneNote[]; todos: CharacterPhoneTodo[] } {
  const phrase = contextPhrase(character, context);
  const noteContent = includesAny(context, ["用户", "朋友", "关系", "喜欢"])
    ? `下次和重要的人聊到${phrase}时，记得问问对方最近有没有好好休息。`
    : `把与${phrase}有关的想法整理一下，别让它们一直堆在心里。`;
  return {
    notes: [{ id: scopedId(phoneId, "note", "seed-1"), title: `${character.name}需要记住的事`, content: noteContent, timestamp: now }],
    todos: [
      { id: scopedId(phoneId, "todo", "seed-1"), text: `准备处理${phrase}`, checked: false, source: "generated" },
      { id: scopedId(phoneId, "todo", "seed-2"), text: `${character.name}留一点时间给自己`, checked: false, source: "generated" },
    ],
  };
}

function durationToSeconds(duration: string): number {
  const [minutes, seconds] = duration.split(":").map(Number);
  return Math.max(60, (minutes || 0) * 60 + (seconds || 0));
}

function syncMusic(
  phone: CharacterPhoneRecord,
  character: Character,
  sourceTracks: MusicTrack[] | undefined,
  now: number,
  context: string,
): { musicTracks: CharacterPhoneMusicTrack[]; listeningHistory: CharacterPhoneListeningRecord[]; musicPlaylists: CharacterPhoneMusicPlaylist[] } {
  const source = sourceTracks && sourceTracks.length > 0
    ? sourceTracks.slice(0, 12)
    : (phone.musicTracks?.length ? phone.musicTracks : DEFAULT_MUSIC_LIBRARY);
  const musicTracks = source.map((track, index) => {
    const sourceTrack = "url" in track ? track as MusicTrack : undefined;
    const sourceId = sourceTrack?.id || ("id" in track ? String(track.id) : `generated-${index}`);
    return {
      id: scopedId(phone.id, "music", sourceId),
      title: sourceTrack?.title || ("title" in track ? String(track.title) : DEFAULT_MUSIC_LIBRARY[index % DEFAULT_MUSIC_LIBRARY.length].title),
      artist: sourceTrack?.artist || ("artist" in track ? String(track.artist) : character.name),
      duration: sourceTrack?.duration || ("duration" in track ? String(track.duration) : "4:00"),
      coverUrl: sourceTrack?.coverUrl,
      sourceTrackId: sourceTrack?.id,
    } satisfies CharacterPhoneMusicTrack;
  });
  const history = phone.listeningHistory?.length
    ? phone.listeningHistory
    : musicTracks.slice(0, 4).map((track, index) => ({
        id: scopedId(phone.id, "listen", `seed-${index}`),
        trackId: track.id,
        startedAt: now - (index + 1) * 90 * 60 * 1000,
        durationSeconds: Math.min(durationToSeconds(track.duration), (index + 2) * 60),
        source: sourceTracks && sourceTracks.length > 0 ? "user-library" as const : "generated" as const,
      }));
  const playlist: CharacterPhoneMusicPlaylist = {
    id: scopedId(phone.id, "playlist", "daily"),
    name: includesAny(context, ["夜", "夜晚", "失眠", "安静"]) ? "角色的深夜歌单" : `${character.name} 的日常歌单`,
    trackIds: musicTracks.map((track) => track.id),
    source: sourceTracks && sourceTracks.length > 0 ? "user-library" : "generated",
  };
  return { musicTracks, listeningHistory: history, musicPlaylists: [playlist] };
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
  return {
    ...phone,
    // These were generated by the old demo fallback, never by the user's
    // chat. Keep awareness alerts because they represent real phone events.
    messages: phone.messages.filter((message) => !message.id.startsWith("phone-message-")),
    threadMessages: phone.threadMessages.filter((message) => {
      const isLegacyGenerated = hasScopedSeed(message.id, "message")
        || message.id.includes(":message:legacy-")
        || message.id.startsWith("phone-thread-message-");
      return !isLegacyGenerated || Boolean(message.operatedByUser || message.sourceMessageId);
    }),
    browserHistory: phone.browserHistory.filter((entry) => !hasScopedSeed(entry.id, "search") && (!entry.id.startsWith("phone-search-") || entry.id.startsWith("phone-search-user-"))),
    diaryEntries: phone.diaryEntries.filter((entry) => !hasScopedSeed(entry.id, "diary") && !entry.id.includes(":diary:private-") && !entry.id.startsWith("phone-diary-")),
    notes: (phone.notes ?? []).filter((note) => !hasScopedSeed(note.id, "note")),
    todos: (phone.todos ?? []).filter((todo) => !hasScopedSeed(todo.id, "todo")),
    scheduleItems: phone.scheduleItems.filter((entry) => !hasScopedSeed(entry.id, "schedule") && !entry.id.startsWith("phone-schedule-")),
    posts: phone.posts.filter((post) => !hasScopedSeed(post.id, "moment") && !post.id.includes(":moment:character-1") && (!post.id.startsWith("phone-post-") || post.id.startsWith("phone-post-user-"))),
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
  const contacts = syncContacts(scopedInput, !seeded);
  const userContact = contacts[0];
  const relationIds = input.relationships
    .filter((relation) => relation.userIdentityId === sourcePhone.ownerIdentityId && relation.characterId === input.character.id)
    .map((relation) => relation.id);
  const chat = syncUserChat(sourcePhone, input.character, userContact, input.messages, input.relationships.filter((relation) => relationIds.includes(relation.id)));
  const moments = syncMoments(sourcePhone, input.character, input.characters, input.activeIdentity, input.moments, contacts);
  const music = syncMusic(sourcePhone, input.character, input.musicTracks, now, context);

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
    const seedDiary = createSeedDiary(sourcePhone.id, input.character, now, context);
    const seedPosts = createSeedPosts(sourcePhone.id, input.character, now, context);
    const seedBrowserHistory = createSeedBrowserHistory(sourcePhone.id, input.character, now, context);
    const seedSchedule = createSeedSchedule(sourcePhone.id, input.character, now, context);
    const seedNotes = createSeedNotes(sourcePhone.id, input.character, context, now);
    const generatedContacts = contacts.filter((contact) => contact.source === "generated");
    next = {
      ...next,
      contentSeededAt: now,
      lastGeneratedAt: now,
      browserHistory: normalizeCharacterPhoneBrowserHistory([...seedBrowserHistory, ...next.browserHistory]),
      diaryEntries: [...seedDiary, ...next.diaryEntries],
      scheduleItems: normalizeScheduleItems([...seedSchedule, ...next.scheduleItems]),
      notes: [...seedNotes.notes, ...(next.notes ?? [])],
      todos: [...seedNotes.todos, ...(next.todos ?? [])],
      posts: [...seedPosts, ...next.posts],
      activities: [
        ...next.activities,
        ...generatedContacts.map((contact) => ({
          id: scopedId(input.phone.id, "activity", `contact-${contact.id}`),
          type: "user_edit" as const,
          label: `生成角色联系人：${contact.name}`,
          timestamp: now,
          relatedToUser: false,
        })),
      ],
    };
  }

  const changed = JSON.stringify(next) !== JSON.stringify(input.phone);
  return changed ? { ...next, updatedAt: now } : input.phone;
}
