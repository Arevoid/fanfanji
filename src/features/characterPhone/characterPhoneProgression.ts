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

function fallbackDelta(character: Character, now: number) {
  return {
    message: { id: createId("phone-message"), sender: character.name, body: "刚刚突然想起一件事，等见面再告诉你。", timestamp: now, unread: true },
    followUp: { id: createId("phone-message"), sender: character.name, body: "算了，还是现在告诉你吧。你今天过得怎么样？", timestamp: now + 1200, unread: true },
    search: { id: createId("phone-search"), query: "今天适合做什么", title: "给今天留一点不一样的安排", timestamp: now - 1000 * 60 * 8 },
    diary: { id: createId("phone-diary"), title: "后来又想了一下", body: "有些话还是先放在心里，等确定对方愿意听了再说。", timestamp: now - 1000 * 60 * 12 },
    schedule: { id: createId("phone-schedule"), title: "记得留一点时间", detail: "给重要的人，也给自己。", timestamp: now + 1000 * 60 * 60 * 5 },
    gallery: { id: createId("phone-gallery"), title: "刚刚看到的天空", caption: "没有滤镜，颜色比想象中更安静。", timestamp: now - 1000 * 60 * 25, source: "generated" as const },
    threadMessage: { id: createId("phone-thread-message"), contactId: "", sender: "contact" as const, content: "你最近怎么总是突然消失？有空回我一下。", timestamp: now - 1000 * 60 * 3 },
    post: { id: createId("phone-post"), author: character.name, content: "有些心情不适合发给特定的人，只适合留在这里。", timestamp: now - 1000 * 60 * 2, likes: 1, comments: [], source: "generated" as const },
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
  const lastOpenedAt = contextualPhone.lastOpenedAt;
  const elapsed = lastOpenedAt ? now - lastOpenedAt : 0;
  const base = { ...contextualPhone, lastOpenedAt: now, updatedAt: now, scheduleItems: contextualPhone.scheduleItems ?? [], galleryItems: contextualPhone.galleryItems ?? [], contacts: contextualPhone.contacts ?? [], threadMessages: contextualPhone.threadMessages ?? [], posts: contextualPhone.posts ?? [] };
  if (!lastOpenedAt || elapsed < 60 * 1000) return base;
  // Opening the phone should feel alive, but repeated unlocks must not create
  // an ever-growing pile of identical-looking records.
  if (base.lastGeneratedAt && now - base.lastGeneratedAt < 6 * 60 * 60 * 1000) return base;
  let delta = fallbackDelta(input.character, now);
  if (input.settings?.apiKey && input.settings.selectedModel) {
    try {
      const response = await apiChat({
        message: `请为角色“${input.character.name}”的虚拟手机补充一小组生活痕迹。只返回 JSON，不要 Markdown：{"message":"角色本人发给某人的一句自然消息","searchQuery":"一条搜索词","searchTitle":"搜索记录标题","diaryTitle":"短日记标题","diaryBody":"80字以内的私密日记"}`,
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
        message: { id: createId("phone-message"), sender: input.character.name, body: safeText(raw.message, delta.message.body), timestamp: now, unread: true },
        followUp: { ...delta.followUp, sender: input.character.name, timestamp: now + 1200 },
        search: { id: createId("phone-search"), query: safeText(raw.searchQuery, delta.search.query), title: safeText(raw.searchTitle, delta.search.title), timestamp: now - 1000 * 60 * 8 },
        diary: { id: createId("phone-diary"), title: safeText(raw.diaryTitle, delta.diary.title), body: safeText(raw.diaryBody, delta.diary.body), timestamp: now - 1000 * 60 * 12 },
        schedule: delta.schedule,
        gallery: delta.gallery,
        threadMessage: delta.threadMessage,
        post: delta.post,
      };
    } catch {
      // Keep local progression available when a provider is unavailable.
    }
  }
  const contactId = base.contacts[0]?.id;
  const threadMessage = contactId ? { ...delta.threadMessage, contactId } : null;
  return { ...base, lastGeneratedAt: now, messages: [...base.messages, delta.message, delta.followUp], browserHistory: [...base.browserHistory, delta.search], diaryEntries: [...base.diaryEntries, delta.diary], scheduleItems: [...base.scheduleItems, delta.schedule], galleryItems: [...base.galleryItems, delta.gallery], threadMessages: threadMessage ? [...base.threadMessages, threadMessage] : base.threadMessages, posts: [...base.posts, delta.post] };
}
