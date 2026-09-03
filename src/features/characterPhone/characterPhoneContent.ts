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
    .sort((left, right) => left.timestamp - right.timestamp);
  const existing = (phone.threadMessages ?? []).filter((message) => message.contactId !== userContact.id);
  const synced = sourceMessages.map((message) => toCharacterMessage(message, phone.id, userContact.id));
  const existingSynced = (phone.threadMessages ?? []).filter((message) => message.contactId === userContact.id && message.sourceMessageId);
  const bySourceId = new Map(existingSynced.map((message) => [message.sourceMessageId, message]));
  const merged = synced.map((message) => bySourceId.get(message.sourceMessageId || "") || message);
  const fallback = phone.threadMessages?.some((message) => message.contactId === userContact.id)
    ? phone.threadMessages.filter((message) => message.contactId === userContact.id)
    : phone.messages.slice().sort((left, right) => left.timestamp - right.timestamp).map((message, index) => ({
      id: scopedId(phone.id, "message", `legacy-${message.id}`),
      contactId: userContact.id,
      sender: index % 2 === 0 ? "character" as const : "contact" as const,
      content: message.body,
      timestamp: message.timestamp,
    }));
  const threadMessages = sourceMessages.length > 0 ? [...existing, ...merged] : [...existing, ...fallback];
  return {
    threadMessages: threadMessages.sort((left, right) => left.timestamp - right.timestamp),
    lastMessageId: sourceMessages.at(-1)?.id,
  };
}

function createSeedDiary(phoneId: string, character: Character, now: number, context: string): CharacterPhoneDiaryEntry[] {
  const privateThought = includesAny(context, ["敏感", "克制", "沉默", "孤独"])
    ? "明明已经想好要说什么，真正面对那个人的时候，还是把话咽了回去。"
    : "今天的事情都按计划完成了，只有那句想说的话，还停在输入框里。";
  return [
    { id: scopedId(phoneId, "diary", "private-1"), title: "没有说出口的话", body: privateThought, timestamp: now - 4 * 60 * 60 * 1000 },
    { id: scopedId(phoneId, "diary", "private-2"), title: "留给自己的记录", body: `${character.name} 不想让任何人看见这段记录。最近有些事情正在慢慢改变，但还不能急着给它下结论。`, timestamp: now - DAY, hidden: true },
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
  const entries = includesAny(context, ["工作", "公司", "学校", "任务"])
    ? [
        ["明天的行程怎么安排比较好", "把一天安排得不拥挤的办法"],
        ["附近安静适合工作的地方", "安静工作地点的选择建议"],
        ["如何在忙碌的时候保持专注", "在忙碌里留住专注力"],
      ]
    : [
        ["适合一个人散步的地方", "安静路线与夜间散步建议"],
        ["怎么让重要的人开心", "让关系变得更亲密的几个小习惯"],
        ["最近总是睡不着怎么办", "睡不着时可以先做的三件小事"],
      ];
  return entries.map(([query, title], index) => ({
    id: scopedId(phoneId, "search", `seed-${index}`),
    query,
    title,
    timestamp: now - (index + 1) * 2 * 60 * 60 * 1000,
  }));
}

function createSeedSchedule(phoneId: string, character: Character, now: number, context: string): CharacterPhoneScheduleItem[] {
  const firstTitle = includesAny(context, ["工作", "公司", "学校", "上班"])
    ? "工作或学习安排"
    : "整理今天的事情";
  return [
    { id: scopedId(phoneId, "schedule", "seed-today"), title: firstTitle, detail: "按角色的日常节奏完成今天的安排。", timestamp: now + 3 * 60 * 60 * 1000 },
    { id: scopedId(phoneId, "schedule", "seed-evening"), title: "晚饭后散步", detail: "给自己留一点不被打扰的时间。", timestamp: now + 7 * 60 * 60 * 1000 },
    { id: scopedId(phoneId, "schedule", "seed-next"), title: `${character.name} 的固定安排`, detail: "一件需要提前准备的小事。", timestamp: now + DAY + 10 * 60 * 60 * 1000 },
  ];
}

function createSeedNotes(phoneId: string, character: Character, context: string, now: number): { notes: CharacterPhoneNote[]; todos: CharacterPhoneTodo[] } {
  const noteContent = includesAny(context, ["用户", "朋友", "关系", "喜欢"])
    ? "下次聊天时记得问问对方最近有没有好好休息。"
    : "把最近想到的事情整理一下，别让它们一直堆在心里。";
  return {
    notes: [{ id: scopedId(phoneId, "note", "seed-1"), title: "需要记住的事", content: noteContent, timestamp: now }],
    todos: [
      { id: scopedId(phoneId, "todo", "seed-1"), text: "把明天需要的东西准备好", checked: false, source: "generated" },
      { id: scopedId(phoneId, "todo", "seed-2"), text: `${character.name} 想留一点时间给自己`, checked: false, source: "generated" },
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
    if (!moment.characterId) return !activeIdentity?.id || moment.ownerIdentityId === activeIdentity.id;
    return relatedCharacterIds.has(moment.characterId) || contactNames.has(moment.authorName);
  });
  const sourcePosts = relevant.map((moment) => ({
    id: scopedId(phone.id, "moment", `source-${moment.id}`),
    author: moment.authorName,
    authorId: moment.characterId,
    authorAvatar: moment.authorAvatar,
    content: moment.content,
    timestamp: moment.timestamp,
    likes: moment.likes.length,
    comments: moment.comments.map((comment) => comment.content),
    source: moment.characterId === character.id ? "generated" as const : !moment.characterId ? "user" as const : "npc" as const,
    sourceMomentId: moment.id,
  }));
  const existingSourceIds = new Set((phone.posts ?? []).map((post) => post.sourceMomentId).filter(Boolean));
  const newPosts = sourcePosts.filter((post) => !existingSourceIds.has(post.sourceMomentId));
  return {
    posts: [...(phone.posts ?? []), ...newPosts].sort((left, right) => right.timestamp - left.timestamp),
    lastMomentId: relevant.slice().sort((left, right) => left.timestamp - right.timestamp).at(-1)?.id,
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
  const seeded = Boolean(input.phone.contentSeededAt);
  const context = buildContext(input.character, input.worldBookEntries);
  const contacts = syncContacts(input, !seeded);
  const userContact = contacts[0];
  const relationIds = input.relationships
    .filter((relation) => relation.userIdentityId === input.phone.ownerIdentityId && relation.characterId === input.character.id)
    .map((relation) => relation.id);
  const chat = syncUserChat(input.phone, input.character, userContact, input.messages, input.relationships.filter((relation) => relationIds.includes(relation.id)));
  const moments = syncMoments(input.phone, input.character, input.characters, input.activeIdentity, input.moments, contacts);
  const music = syncMusic(input.phone, input.character, input.musicTracks, now, context);

  let next: CharacterPhoneRecord = {
    ...input.phone,
    messages: normalizeCharacterPhoneMessages(input.phone.messages),
    contacts,
    threadMessages: chat.threadMessages,
    posts: moments.posts,
    musicTracks: music.musicTracks,
    listeningHistory: music.listeningHistory,
    musicPlaylists: music.musicPlaylists,
    browserHistory: normalizeCharacterPhoneBrowserHistory(input.phone.browserHistory),
    diaryEntries: normalizeDiaryEntries(input.phone.diaryEntries),
    galleryItems: normalizeGalleryItems(input.phone.galleryItems),
    scheduleItems: normalizeScheduleItems(input.phone.scheduleItems),
    updatedAt: input.phone.updatedAt,
    lastSyncedMessageId: chat.lastMessageId ?? input.phone.lastSyncedMessageId,
    lastSyncedMomentId: moments.lastMomentId ?? input.phone.lastSyncedMomentId,
  };

  if (!seeded) {
    const seedDiary = createSeedDiary(input.phone.id, input.character, now, context);
    const seedPosts = createSeedPosts(input.phone.id, input.character, now, context);
    const seedBrowserHistory = createSeedBrowserHistory(input.phone.id, input.character, now, context);
    const seedSchedule = createSeedSchedule(input.phone.id, input.character, now, context);
    const seedNotes = createSeedNotes(input.phone.id, input.character, context, now);
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
