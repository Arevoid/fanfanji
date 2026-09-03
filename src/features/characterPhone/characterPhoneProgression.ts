import { apiChat } from "../../utils/apiHelper";
import { createId } from "../../core/id/createId";
import type { Character, Message, Moment, MusicTrack, UserIdentity, UserSettings, WorldBookEntry } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import type { CharacterPhoneRecord } from "../../domain/characterPhone/types";
import { ensureCharacterPhoneContent } from "./characterPhoneContent";

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("角色手机内容生成失败");
  const value = JSON.parse(cleaned.slice(start, end + 1));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("角色手机内容格式无效");
  return value as Record<string, unknown>;
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 600) : fallback;
}

function roleContextPhrase(character: Character, entries: WorldBookEntry[] = []): string {
  const source = [
    character.personality,
    character.backstory,
    ...entries
      .filter((entry) => entry.isActive !== false
        && (!entry.characterId
          || entry.characterId === "global"
          || entry.characterId === character.id
          || entry.characterIds?.includes(character.id)))
      .flatMap((entry) => [entry.title, entry.content]),
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return (source.split(/[。！？.!?]/)[0]?.trim() || `${character.name}的近况`).slice(0, 36);
}

function fallbackDelta(character: Character, now: number, worldBookEntries: WorldBookEntry[] = []) {
  const phrase = roleContextPhrase(character, worldBookEntries);
  return {
    message: { id: createId("phone-generated-message"), sender: character.name, body: `刚刚又想起${phrase}，等见面再告诉你。`, timestamp: now, unread: true },
    followUp: { id: createId("phone-generated-message"), sender: character.name, body: `算了，还是现在告诉你吧。你今天过得怎么样？`, timestamp: now + 1200, unread: true },
    search: { id: createId("phone-generated-search"), query: `${character.name} ${phrase} 怎么安排`, title: `关于${phrase}的搜索记录`, timestamp: now - 1000 * 60 * 8 },
    diary: { id: createId("phone-generated-diary"), title: `${character.name}又想了一下`, body: `${phrase}仍然停在心里。有些话还是先放着，等确定对方愿意听了再说。`, timestamp: now - 1000 * 60 * 12 },
    note: { id: createId("phone-generated-note"), title: `${character.name}需要记住的事`, content: `别忘了处理与${phrase}有关的安排。`, timestamp: now - 1000 * 60 * 10 },
    todo: { id: createId("phone-generated-todo"), text: `留时间处理${phrase}`, checked: false, source: "generated" as const },
    schedule: { id: createId("phone-generated-schedule"), title: `${character.name}的${phrase}安排`, detail: `给${character.name}留出处理这件事的时间。`, timestamp: now + 1000 * 60 * 60 * 5 },
    gallery: { id: createId("phone-generated-gallery"), title: `${character.name}记录的片刻`, caption: `和${phrase}有关，值得留在相册里。`, timestamp: now - 1000 * 60 * 25, source: "generated" as const },
    threadMessage: { id: createId("phone-generated-thread-message"), contactId: "", sender: "contact" as const, content: `${character.name}，你最近是不是又在忙${phrase}？有空回我一下。`, timestamp: now - 1000 * 60 * 3 },
    post: { id: createId("phone-generated-post"), author: character.name, content: `关于${phrase}，今天先记录到这里。`, timestamp: now - 1000 * 60 * 2, likes: 1, comments: [], source: "generated" as const },
  };
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
  const contextualPhone = input.messages && input.moments && input.worldBookEntries
    ? ensureCharacterPhoneContent({
        phone: input.phone,
        character: input.character,
        characters: input.characters ?? [input.character],
        activeIdentity: input.activeIdentity,
        relationships: input.relationships ?? [],
        messages: input.messages,
        moments: input.moments,
        worldBookEntries: input.worldBookEntries,
        musicTracks: input.musicTracks,
        now,
      })
    : input.phone;
  const base = { ...contextualPhone, lastOpenedAt: now, updatedAt: now, scheduleItems: contextualPhone.scheduleItems ?? [], galleryItems: contextualPhone.galleryItems ?? [], contacts: contextualPhone.contacts ?? [], threadMessages: contextualPhone.threadMessages ?? [], posts: contextualPhone.posts ?? [] };
  // A successful unlock is the generation boundary. Generate a small new
  // batch for that character every time instead of displaying static demo
  // records before unlock.
  let delta = fallbackDelta(input.character, now, input.worldBookEntries);
  if (input.settings?.apiKey && input.settings.selectedModel) {
    try {
      const response = await apiChat({
        message: `请为角色“${input.character.name}”的虚拟手机补充一小组生活痕迹。只返回 JSON，不要 Markdown：{"message":"角色本人发给某人的一句自然消息","followUp":"同一角色的第二句消息","searchQuery":"一条搜索词","searchTitle":"搜索记录标题","diaryTitle":"短日记标题","diaryBody":"80字以内的私密日记","noteTitle":"备忘录标题","noteContent":"备忘录内容","todoText":"一条待办","scheduleTitle":"日程标题","scheduleDetail":"日程详情","postContent":"朋友圈内容","threadMessage":"联系人发来的一句话","galleryTitle":"相册标题","galleryCaption":"相册描述"}`,
        history: [],
        systemInstruction: `角色人设：${input.character.personality}\n角色背景：${input.character.backstory}\n世界书：${(input.worldBookEntries ?? []).filter((entry) => entry.isActive !== false && (!entry.characterId || entry.characterId === "global" || entry.characterId === input.character.id || entry.characterIds?.includes(input.character.id))).map((entry) => `${entry.title}: ${entry.content}`).join("\\n")}\n要求：内容必须符合角色，不要生成与用户好友列表有关的联系人，不要剧透未知事实；只生成少量内容。`,
        apiKey: input.settings.apiKey,
        model: input.settings.selectedModel,
        apiEndpoint: input.settings.apiEndpoint,
        apiTemperature: input.settings.apiTemperature,
        streamCompatible: input.settings.streamCompatible,
      });
      const raw = parseJson(response.text);
      delta = {
        message: { id: createId("phone-generated-message"), sender: input.character.name, body: safeText(raw.message, delta.message.body), timestamp: now, unread: true },
        followUp: { ...delta.followUp, id: createId("phone-generated-message"), sender: input.character.name, body: safeText(raw.followUp, delta.followUp.body), timestamp: now + 1200 },
        search: { id: createId("phone-generated-search"), query: safeText(raw.searchQuery, delta.search.query), title: safeText(raw.searchTitle, delta.search.title), timestamp: now - 1000 * 60 * 8 },
        diary: { id: createId("phone-generated-diary"), title: safeText(raw.diaryTitle, delta.diary.title), body: safeText(raw.diaryBody, delta.diary.body), timestamp: now - 1000 * 60 * 12 },
        note: { ...delta.note, id: createId("phone-generated-note"), title: safeText(raw.noteTitle, delta.note.title), content: safeText(raw.noteContent, delta.note.content) },
        todo: { ...delta.todo, id: createId("phone-generated-todo"), text: safeText(raw.todoText, delta.todo.text) },
        schedule: { ...delta.schedule, id: createId("phone-generated-schedule"), title: safeText(raw.scheduleTitle, delta.schedule.title), detail: safeText(raw.scheduleDetail, delta.schedule.detail) },
        gallery: { ...delta.gallery, id: createId("phone-generated-gallery"), title: safeText(raw.galleryTitle, delta.gallery.title), caption: safeText(raw.galleryCaption, delta.gallery.caption) },
        threadMessage: { ...delta.threadMessage, id: createId("phone-generated-thread-message"), content: safeText(raw.threadMessage, delta.threadMessage.content) },
        post: { ...delta.post, id: createId("phone-generated-post"), content: safeText(raw.postContent, delta.post.content) },
      };
    } catch {
      // Keep local progression available when a provider is unavailable.
    }
  }
  // The user's own thread is a mirror of the real chat and must not receive
  // synthetic messages. Generated chat traces belong to a role/NPC contact.
  const contactId = base.contacts.find((contact) => contact.source !== "user" && !contact.removedAt)?.id;
  const threadMessage = contactId ? { ...delta.threadMessage, contactId } : null;
  return { ...base, lastGeneratedAt: now, messages: [...base.messages, delta.message, delta.followUp], browserHistory: [...base.browserHistory, delta.search], diaryEntries: [...base.diaryEntries, delta.diary], notes: [delta.note, ...(base.notes ?? [])], todos: [delta.todo, ...(base.todos ?? [])], scheduleItems: [...base.scheduleItems, delta.schedule], galleryItems: [...base.galleryItems, delta.gallery], threadMessages: threadMessage ? [...base.threadMessages, threadMessage] : base.threadMessages, posts: [...base.posts, delta.post] };
}
