import { apiChat } from "../../utils/apiHelper";
import { createId } from "../../core/id/createId";
import type { Character, Message, Moment, MusicTrack, UserIdentity, UserSettings, WorldBookEntry } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import type {
  CharacterPhoneContact,
  CharacterPhoneDiaryEntry,
  CharacterPhoneGalleryItem,
  CharacterPhoneNote,
  CharacterPhonePost,
  CharacterPhoneRecord,
  CharacterPhoneScheduleItem,
  CharacterPhoneThreadMessage,
  CharacterPhoneTodo,
} from "../../domain/characterPhone/types";
import { ensureCharacterPhoneContent } from "./characterPhoneContent";

type GeneratedContactDraft = {
  name: string;
  relation: string;
  isLongTerm?: boolean;
};

type GeneratedPhonePayload = {
  contacts?: unknown;
  threadContactName?: unknown;
  threadIncoming?: unknown;
  threadOutgoing?: unknown;
  // Keep accepting the older keys so a provider response can be upgraded
  // without reviving the old fixed fallback content.
  message?: unknown;
  threadMessage?: unknown;
  searchQuery?: unknown;
  searchTitle?: unknown;
  diaryTitle?: unknown;
  diaryBody?: unknown;
  noteTitle?: unknown;
  noteContent?: unknown;
  todoText?: unknown;
  scheduleTitle?: unknown;
  scheduleDetail?: unknown;
  scheduleAtHours?: unknown;
  postContent?: unknown;
  galleryTitle?: unknown;
  galleryCaption?: unknown;
};

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("角色手机内容生成失败");
  const value = JSON.parse(cleaned.slice(start, end + 1));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("角色手机内容格式无效");
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, sourceFileName?: string, limit = 600): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const filename = sourceFileName?.trim();
  const stem = filename?.replace(/\.[^/.]+$/, "").trim();
  const candidates = [filename, stem].filter((candidate): candidate is string => Boolean(candidate && candidate.length >= 2));
  const cleaned = candidates.reduce((result, candidate) => result.split(candidate).join(""), value)
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.slice(0, limit);
}

function roleDisplayName(character: Character): string {
  const name = character.name?.trim();
  const sourceFileName = character.sourceFileName?.trim();
  const sourceStem = sourceFileName?.replace(/\.[^/.]+$/, "").trim();
  const isFilename = Boolean(name && sourceFileName && (name === sourceFileName || name === sourceStem));
  if (name && !isFilename) return name;
  const remark = character.remark?.trim();
  return remark && remark !== sourceFileName && remark !== sourceStem ? remark : "这个角色";
}

function buildRecentContext(input: {
  character: Character;
  phone: CharacterPhoneRecord;
  activeIdentity?: UserIdentity;
  relationships: CharacterRelationship[];
  messages: Message[];
  moments: Moment[];
  worldBookEntries: WorldBookEntry[];
}): string {
  const relevantEntries = input.worldBookEntries
    .filter((entry) => entry.isActive !== false
      && (!entry.characterId
        || entry.characterId === "global"
        || entry.characterId === input.character.id
        || entry.characterIds?.includes(input.character.id)))
    .slice(0, 24)
    .map((entry) => `${entry.title}: ${entry.content}`);
  const relationIds = new Set(input.relationships
    .filter((relation) => relation.characterId === input.character.id
      && (!input.activeIdentity?.id || relation.userIdentityId === input.activeIdentity.id))
    .map((relation) => relation.id));
  const recentChat = input.messages
    .filter((message) => message.characterId === input.character.id && (!message.relationId || relationIds.has(message.relationId)))
    .filter((message) => !message.id.startsWith("phone-proactive-"))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 12)
    .reverse()
    .map((message) => `${message.sender === "user" ? "用户" : roleDisplayName(input.character)}：${message.content}`);
  const recentMoments = input.moments
    .filter((moment) => moment.characterId === input.character.id
      || (!moment.characterId && (!input.activeIdentity?.id || !moment.ownerIdentityId || moment.ownerIdentityId === input.activeIdentity.id)))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 8)
    .map((moment) => `${moment.authorName}：${moment.content}`)
    .reverse();
  const recentPhoneThreads = (input.phone.threadMessages ?? [])
    .filter((message) => message.content.trim())
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 10)
    .reverse()
    .map((message) => {
      const contact = input.phone.contacts.find((candidate) => candidate.id === message.contactId);
      return `${message.sender === "character" ? roleDisplayName(input.character) : contact?.name || "联系人"}：${message.content}`;
    });
  const contacts = input.phone.contacts
    .filter((contact) => !contact.removedAt)
    .map((contact) => `${contact.name}（${contact.remark || contact.relation}）`)
    .join("、");
  return [
    `角色资料：${roleDisplayName(input.character)}`,
    `人设：${input.character.personality || "未提供"}`,
    `背景：${input.character.backstory || "未提供"}`,
    `世界书：${relevantEntries.join("\n") || "未提供"}`,
    `已有联系人：${contacts || "只有与用户的联系"}`,
    `最近与用户的聊天：${recentChat.join("\n") || "暂无新的聊天"}`,
    `最近朋友圈：${recentMoments.join("\n") || "暂无新的动态"}`,
    `角色手机里最近的联系人对话：${recentPhoneThreads.join("\n") || "暂无对话"}`,
  ].join("\n");
}

function parseContactDrafts(value: unknown, character: Character, sourceFileName?: string): GeneratedContactDraft[] {
  if (!Array.isArray(value)) return [];
  const drafts: GeneratedContactDraft[] = [];
  const sourceStem = sourceFileName?.replace(/\.[^/.]+$/, "").trim();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const candidate = item as Record<string, unknown>;
    const name = cleanText(candidate.name, sourceFileName, 40);
    const relation = cleanText(candidate.relation, sourceFileName, 80);
    if (!name || name === character.name || name === sourceStem || name === "这个角色" || name === "角色") continue;
    if (drafts.some((draft) => draft.name.toLocaleLowerCase() === name.toLocaleLowerCase())) continue;
    drafts.push({ name, relation: relation || "联系人", isLongTerm: candidate.isLongTerm !== false });
  }
  return drafts.slice(0, 6);
}

function contactKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function contactIdPart(name: string): string {
  return encodeURIComponent(name.trim()).replace(/%/g, "_").slice(0, 80);
}

function mergeGeneratedContacts(
  phone: CharacterPhoneRecord,
  drafts: GeneratedContactDraft[],
): { contacts: CharacterPhoneContact[]; added: CharacterPhoneContact[] } {
  const contacts = [...(phone.contacts ?? [])];
  const known = new Set(contacts.map((contact) => contactKey(contact.name)));
  const added: CharacterPhoneContact[] = [];
  drafts.forEach((draft) => {
    if (known.has(contactKey(draft.name))) return;
    const contact: CharacterPhoneContact = {
      id: `phone-life-contact-${contactIdPart(draft.name)}`,
      name: draft.name,
      relation: draft.relation,
      isLongTerm: draft.isLongTerm !== false,
      isNpc: true,
      source: "generated",
    };
    contacts.push(contact);
    added.push(contact);
    known.add(contactKey(draft.name));
  });
  return { contacts, added };
}

function findThreadContact(
  contacts: CharacterPhoneContact[],
  requestedName: string,
  newlyAdded: CharacterPhoneContact[],
): CharacterPhoneContact | undefined {
  const visibleNpcContacts = contacts.filter((contact) => !contact.removedAt && contact.source !== "user");
  if (requestedName) {
    return visibleNpcContacts.find((contact) => contactKey(contact.name) === contactKey(requestedName));
  }
  if (newlyAdded.length === 1) return newlyAdded[0];
  return visibleNpcContacts.length === 1 ? visibleNpcContacts[0] : undefined;
}

function hasText(value: string): boolean {
  return Boolean(value.trim());
}

export async function advanceCharacterPhone(input: {
  phone: CharacterPhoneRecord;
  character: Character;
  characters?: Character[];
  activeIdentity?: UserIdentity;
  relationships?: CharacterRelationship[];
  messages?: Message[];
  moments?: Moment[];
  worldBookEntries?: WorldBookEntry[];
  musicTracks?: MusicTrack[];
  settings?: UserSettings;
  now?: number;
}): Promise<CharacterPhoneRecord> {
  const now = input.now ?? Date.now();
  const characters = input.characters ?? [input.character];
  const relationships = input.relationships ?? [];
  const messages = input.messages ?? [];
  const moments = input.moments ?? [];
  const worldBookEntries = input.worldBookEntries ?? [];
  const contextualPhone = input.messages && input.moments && input.worldBookEntries
    ? ensureCharacterPhoneContent({
        phone: input.phone,
        character: input.character,
        characters,
        activeIdentity: input.activeIdentity,
        relationships,
        messages,
        moments,
        worldBookEntries,
        musicTracks: input.musicTracks,
        now,
      })
    : input.phone;
  const base: CharacterPhoneRecord = {
    ...contextualPhone,
    lastOpenedAt: now,
    updatedAt: now,
    scheduleItems: contextualPhone.scheduleItems ?? [],
    galleryItems: contextualPhone.galleryItems ?? [],
    contacts: contextualPhone.contacts ?? [],
    threadMessages: contextualPhone.threadMessages ?? [],
    posts: contextualPhone.posts ?? [],
  };

  // No API means no invented diary, schedule, search, contact, or chat. The
  // phone keeps real synchronized data instead of falling back to templates.
  if (!input.settings?.apiKey || !input.settings.selectedModel) return base;

  const context = buildRecentContext({
    character: input.character,
    phone: base,
    activeIdentity: input.activeIdentity,
    relationships,
    messages,
    moments,
    worldBookEntries,
  });
  const roleName = roleDisplayName(input.character);
  let response;
  try {
    response = await apiChat({
      message: `请根据下面这份“角色当前生活上下文”，生成少量真实、具体、彼此一致的手机生活痕迹。你是在模拟一个真实的人，而不是给应用填充示例数据。只返回 JSON，不要 Markdown：{"contacts":[{"name":"有依据的联系人姓名","relation":"与角色的关系","isLongTerm":true}],"threadContactName":"本次联系人对话对应的联系人姓名","threadIncoming":"联系人发给角色的一句话","threadOutgoing":"角色发给该联系人的一句话","searchQuery":"角色确实可能搜索的词","searchTitle":"搜索记录标题","diaryTitle":"角色私密日记标题","diaryBody":"角色私密日记内容","noteTitle":"备忘录标题","noteContent":"备忘录内容","todoText":"角色确实需要完成的待办","scheduleTitle":"具体日程标题","scheduleDetail":"具体日程详情","scheduleAtHours":5,"postContent":"角色可能发布的朋友圈内容","galleryTitle":"角色保存的相册标题","galleryCaption":"相册图片描述"}\n若没有足够依据生成某个字段，返回空字符串或空数组。`,
      history: [],
      systemInstruction: `你扮演真实存在的角色“${roleName}”，正在整理他自己的手机。\n${context}\n\n严格规则：
1. 所有内容必须来自角色人设、世界书、最近上下文或已有手机记录的合理延伸；不能凭空制造与角色无关的人和事件。
2. 联系人只能是角色现实中可能认识的人：用户、已有角色关系、世界书/人设明确提到的家人朋友同事，或有明确依据的新 NPC。不要读取或生成用户不认识该角色的好友。
3. threadContactName 必须对应 contacts 或已有联系人；无法判断具体联系人就不要生成聊天字段。不要把联系人聊天塞进用户与角色的聊天镜像。
4. 内容要像真实手机记录：可以不完整、延迟、含蓄或不规律，不要每个应用都强行生成一条，不要使用“角色的日常”“角色需要记住的事”“又想了一下”等模板标题。
5. 角色真实姓名、备注名和人设文件名是不同概念。绝不能把文件名、输入字段名、世界书标题当作角色姓名或正文内容。
6. 不要生成解释、旁白、占位符、统一问候或应用说明；只返回 JSON。`,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
      streamCompatible: input.settings.streamCompatible,
    });
  } catch {
    return base;
  }

  let raw: GeneratedPhonePayload;
  try {
    raw = parseJson(response.text) as GeneratedPhonePayload;
  } catch {
    return base;
  }

  const sourceFileName = input.character.sourceFileName;
  const contactDrafts = parseContactDrafts(raw.contacts, input.character, sourceFileName);
  const mergedContacts = mergeGeneratedContacts(base, contactDrafts);
  const requestedThreadContact = cleanText(raw.threadContactName, sourceFileName, 40);
  const threadContact = findThreadContact(mergedContacts.contacts, requestedThreadContact, mergedContacts.added);
  const incoming = cleanText(raw.threadIncoming || raw.threadMessage, sourceFileName);
  const outgoing = cleanText(raw.threadOutgoing || raw.message, sourceFileName);
  const next: CharacterPhoneRecord = {
    ...base,
    contacts: mergedContacts.contacts,
    browserHistory: [...base.browserHistory],
    diaryEntries: [...base.diaryEntries],
    notes: [...(base.notes ?? [])],
    todos: [...(base.todos ?? [])],
    scheduleItems: [...base.scheduleItems],
    galleryItems: [...base.galleryItems],
    threadMessages: [...base.threadMessages],
    posts: [...base.posts],
  };
  let generated = mergedContacts.added.length > 0;
  const pushIfNew = <T>(items: T[], item: T, signature: (value: T) => string) => {
    if (items.some((existing) => signature(existing) === signature(item))) return;
    items.push(item);
    generated = true;
  };

  if (threadContact && (hasText(incoming) || hasText(outgoing))) {
    if (hasText(incoming)) {
      const message: CharacterPhoneThreadMessage = {
        id: createId("phone-life-thread-incoming"),
        contactId: threadContact.id,
        sender: "contact",
        content: incoming,
        timestamp: now - 60 * 1000,
      };
      pushIfNew(next.threadMessages, message, (value) => `${value.contactId}|${value.sender}|${value.content}`);
    }
    if (hasText(outgoing)) {
      const message: CharacterPhoneThreadMessage = {
        id: createId("phone-life-thread-outgoing"),
        contactId: threadContact.id,
        sender: "character",
        content: outgoing,
        timestamp: now,
      };
      pushIfNew(next.threadMessages, message, (value) => `${value.contactId}|${value.sender}|${value.content}`);
    }
  }

  const searchQuery = cleanText(raw.searchQuery, sourceFileName, 180);
  const searchTitle = cleanText(raw.searchTitle, sourceFileName, 180);
  if (searchQuery || searchTitle) {
    const entry = { id: createId("phone-life-search"), query: searchQuery || searchTitle, title: searchTitle || searchQuery, timestamp: now - 8 * 60 * 1000 };
    pushIfNew(next.browserHistory, entry, (value) => `${value.query}|${value.title}`);
  }
  const diaryTitle = cleanText(raw.diaryTitle, sourceFileName, 160);
  const diaryBody = cleanText(raw.diaryBody, sourceFileName);
  if (diaryTitle || diaryBody) {
    const entry: CharacterPhoneDiaryEntry = { id: createId("phone-life-diary"), title: diaryTitle || "未命名记录", body: diaryBody, timestamp: now - 12 * 60 * 1000 };
    pushIfNew(next.diaryEntries, entry, (value) => `${value.title}|${value.body}`);
  }
  const noteTitle = cleanText(raw.noteTitle, sourceFileName, 160);
  const noteContent = cleanText(raw.noteContent, sourceFileName);
  if (noteTitle || noteContent) {
    const entry: CharacterPhoneNote = { id: createId("phone-life-note"), title: noteTitle || "未命名笔记", content: noteContent, timestamp: now - 10 * 60 * 1000 };
    pushIfNew(next.notes ?? (next.notes = []), entry, (value) => `${value.title}|${value.content}`);
  }
  const todoText = cleanText(raw.todoText, sourceFileName, 180);
  if (todoText) {
    const entry: CharacterPhoneTodo = { id: createId("phone-life-todo"), text: todoText, checked: false, source: "generated" };
    pushIfNew(next.todos ?? (next.todos = []), entry, (value) => value.text);
  }
  const scheduleTitle = cleanText(raw.scheduleTitle, sourceFileName, 160);
  const scheduleDetail = cleanText(raw.scheduleDetail, sourceFileName);
  if (scheduleTitle || scheduleDetail) {
    const hours = typeof raw.scheduleAtHours === "number" && Number.isFinite(raw.scheduleAtHours)
      ? Math.max(1, Math.min(72, raw.scheduleAtHours))
      : 5;
    const entry: CharacterPhoneScheduleItem = { id: createId("phone-life-schedule"), title: scheduleTitle || "未命名安排", detail: scheduleDetail, timestamp: now + hours * 60 * 60 * 1000 };
    pushIfNew(next.scheduleItems, entry, (value) => `${value.title}|${value.detail}|${value.timestamp}`);
  }
  const galleryTitle = cleanText(raw.galleryTitle, sourceFileName, 160);
  const galleryCaption = cleanText(raw.galleryCaption, sourceFileName);
  if (galleryTitle || galleryCaption) {
    const entry: CharacterPhoneGalleryItem = { id: createId("phone-life-gallery"), title: galleryTitle || "未命名照片", caption: galleryCaption, timestamp: now - 25 * 60 * 1000, source: "generated" };
    pushIfNew(next.galleryItems, entry, (value) => `${value.title}|${value.caption}`);
  }
  const postContent = cleanText(raw.postContent, sourceFileName);
  if (postContent) {
    const entry: CharacterPhonePost = { id: createId("phone-life-post"), author: roleName, authorId: input.character.id, authorAvatar: input.character.avatar, content: postContent, timestamp: now - 2 * 60 * 1000, likes: 0, comments: [], source: "generated" };
    pushIfNew(next.posts, entry, (value) => value.content);
  }

  return generated ? { ...next, lastGeneratedAt: now, updatedAt: now } : base;
}
