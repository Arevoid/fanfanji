import { apiChat } from "../../utils/apiHelper";
import { createId } from "../../core/id/createId";
import type { Character, Message, Moment, MusicTrack, UserIdentity, UserSettings, WorldBookEntry } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import type { RelationshipNetworkMap, RelationshipNetworkNpc } from "../../domain/relationshipNetwork/relationshipNetworkTypes";
import type {
  CharacterPhoneContact,
  CharacterPhoneDiaryEntry,
  CharacterPhoneGalleryItem,
  CharacterPhoneLifeEvent,
  CharacterPhoneNote,
  CharacterPhoneCallRecord,
  CharacterPhoneBrowserResult,
  CharacterPhonePost,
  CharacterPhoneRecord,
  CharacterPhoneScheduleItem,
  CharacterPhoneThreadMessage,
  CharacterPhoneTodo,
} from "../../domain/characterPhone/types";
import { parseTextImageDescription } from "../chat/services/messageParser";
import { cleanAndExtractMoment } from "../moments/services/momentContent";
import { ensureCharacterPhoneContent } from "./characterPhoneContent";
import { buildCharacterPhoneBrowserDetail } from "./characterPhoneBrowserDetails";
import { buildCharacterPhoneLifeContext, type CharacterPhoneLifeContext } from "./characterPhoneLifeContext";
import { listCharacterPhoneRelationshipNetworkContacts } from "./characterPhoneRelationshipNetwork";
import { createCharacterPhoneTextImageDataUrl } from "./characterPhoneTextImage";

type GeneratedContactDraft = {
  name: string;
  relation: string;
  isLongTerm?: boolean;
  kind?: "npc" | "group";
  memberNames?: string[];
};

type GeneratedPhonePayload = {
  lifeEventSummary?: unknown;
  lifeEventAtHoursAgo?: unknown;
  evidenceSourceIds?: unknown;
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
  searchResults?: unknown;
  searchReflection?: unknown;
  /** Legacy provider key accepted for browser heart-voice migration. */
  reflection?: unknown;
  diaryTitle?: unknown;
  diaryBody?: unknown;
  noteTitle?: unknown;
  noteContent?: unknown;
  todoText?: unknown;
  scheduleTitle?: unknown;
  scheduleDetail?: unknown;
  scheduleAtHours?: unknown;
  callContactName?: unknown;
  callDirection?: unknown;
  callDurationSeconds?: unknown;
  postContent?: unknown;
  galleryTitle?: unknown;
  galleryCaption?: unknown;
  hiddenGalleryTitle?: unknown;
  hiddenGalleryCaption?: unknown;
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

const GENERATED_PLACEHOLDER_PATTERN = /^(?:未命名(?:记录|笔记|安排|照片)?|无标题|标题|内容|备注|角色(?:的)?(?:日常|记录|手机)|角色需要记住的事|又想了一下|暂无|无)$/i;

function cleanGeneratedText(value: unknown, sourceFileName?: string, limit = 600): string {
  const cleaned = cleanText(value, sourceFileName, limit);
  return GENERATED_PLACEHOLDER_PATTERN.test(cleaned) ? "" : cleaned;
}

function parseGeneratedBrowserResults(value: unknown, sourceFileName?: string): CharacterPhoneBrowserResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const platform = cleanGeneratedText(record.platform ?? record.source ?? record.site, sourceFileName, 32);
    const title = cleanGeneratedText(record.title, sourceFileName, 100);
    const snippet = cleanGeneratedText(record.snippet ?? record.summary ?? record.answer, sourceFileName, 220);
    return platform && title && snippet ? [{ platform, title, snippet }] : [];
  }).slice(0, 3);
}

function deriveGeneratedTitle(body: string, sourceFileName?: string, limit = 160): string {
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
  return cleanGeneratedText(firstLine.replace(/^[#*_\-\d.\s]+/, ""), sourceFileName, limit);
}

function normalizeGalleryTextImageTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) return "生活片段 · 文字图";
  return /文字图$/u.test(normalized) ? normalized : `${normalized} · 文字图`;
}

function redactSourceFileName(value: string, sourceFileName?: string): string {
  const filename = sourceFileName?.trim();
  const stem = filename?.replace(/\.[^/.]+$/, "").trim();
  return [filename, stem]
    .filter((candidate): candidate is string => Boolean(candidate && candidate.length >= 2))
    .reduce((result, candidate) => result.split(candidate).join("[来源文件名]"), value);
}

function isLikelyFileName(value: string): boolean {
  return /\.[a-z0-9]{1,8}$/i.test(value) || /^(?:character|persona|profile|角色|人设)[\s_-]/i.test(value);
}

function roleDisplayName(character: Character): string {
  const name = character.name?.trim();
  const sourceFileName = character.sourceFileName?.trim();
  const sourceStem = sourceFileName?.replace(/\.[^/.]+$/, "").trim();
  const isFilename = Boolean(name && (isLikelyFileName(name) || (sourceFileName && (name === sourceFileName || name === sourceStem))));
  if (name && !isFilename) return name;
  const remark = character.remark?.trim();
  return remark && !isLikelyFileName(remark) && remark !== sourceFileName && remark !== sourceStem ? remark : "这个角色";
}

type CharacterPhoneTextImageEvidence = {
  sourceKind: "chat" | "moment";
  sourceId: string;
  description: string;
  label: string;
};

function collectTextImageEvidence(lifeContext: CharacterPhoneLifeContext): CharacterPhoneTextImageEvidence[] {
  const chatEvidence = lifeContext.recentMessages
    .map((message) => ({
      sourceKind: "chat" as const,
      sourceId: message.id,
      description: parseTextImageDescription(message.content)?.trim() || "",
      label: `${message.sender === "user" ? "用户" : "角色"}聊天文字图`,
    }))
    .filter((item) => item.description);
  const momentEvidence = lifeContext.recentMoments
    .map((moment) => ({
      sourceKind: "moment" as const,
      sourceId: moment.id,
      description: moment.imageDescription?.trim() || cleanAndExtractMoment(moment.content).imageDescription?.trim() || "",
      label: `${moment.authorName || "朋友圈"}的文字图`,
    }))
    .filter((item) => item.description);
  return [...chatEvidence, ...momentEvidence].slice(-8);
}

function buildRecentContext(input: {
  character: Character;
  phone: CharacterPhoneRecord;
  activeIdentity?: UserIdentity;
  relationships: CharacterRelationship[];
  messages: Message[];
  moments: Moment[];
  worldBookEntries: WorldBookEntry[];
  relationshipNetworkNpcs?: RelationshipNetworkNpc[];
  relationshipNetworkMaps?: RelationshipNetworkMap[];
}): string {
  const relationshipNetworkContacts = listCharacterPhoneRelationshipNetworkContacts({
    character: input.character,
    ownerIdentityId: input.phone.ownerIdentityId,
    characters: [input.character],
    npcs: input.relationshipNetworkNpcs || [],
    maps: input.relationshipNetworkMaps || [],
  });
  const lifeContext = buildCharacterPhoneLifeContext({ ...input, relationshipNetworkContacts });
  const relevantEntries = lifeContext.worldBookEntries
    .slice()
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, 24)
    .map((entry) => `条目标题（不是角色姓名）：${redactSourceFileName(entry.title, input.character.sourceFileName)}\n条目内容：${redactSourceFileName(entry.content, input.character.sourceFileName)}`);
  const recentChat = lifeContext.recentMessages
    .slice(-12)
    .map((message) => {
      const textImage = parseTextImageDescription(message.content);
      const content = textImage ? `文字图：${textImage}` : message.content;
      return `${message.sender === "user" ? "用户" : roleDisplayName(input.character)}：${redactSourceFileName(content, input.character.sourceFileName)}`;
    });
  const recentMoments = lifeContext.recentMoments
    .filter((moment) => moment.characterId === input.character.id
      || (!moment.characterId && moment.ownerIdentityId === input.phone.ownerIdentityId)
      || Boolean(moment.relationshipNetworkNpcId
        && lifeContext.relationshipNetworkContacts.some((contact) => contact.npc.id === moment.relationshipNetworkNpcId)))
    .slice(-8)
    .map((moment) => `${moment.authorName}：${redactSourceFileName(moment.content, input.character.sourceFileName)}`);
  const recentTextImages = collectTextImageEvidence(lifeContext)
    .map((item) => `${item.sourceKind}:${item.sourceId}（${item.label}）：${redactSourceFileName(item.description, input.character.sourceFileName)}`);
  const recentPhoneThreads = (input.phone.threadMessages ?? [])
    .filter((message) => message.content.trim())
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 10)
    .reverse()
    .map((message) => {
      const contact = input.phone.contacts.find((candidate) => candidate.id === message.contactId);
      return `${message.sender === "character" ? roleDisplayName(input.character) : contact?.name || "联系人"}：${redactSourceFileName(message.content, input.character.sourceFileName)}`;
    });
  const contacts = input.phone.contacts
    .filter((contact) => !contact.removedAt)
    .map((contact) => `${redactSourceFileName(contact.name, input.character.sourceFileName)}（${redactSourceFileName(contact.remark || contact.relation, input.character.sourceFileName)}）`)
    .join("、");
  const networkContacts = lifeContext.relationshipNetworkContacts
    .map((contact) => {
      const npc = contact.npc;
      const relation = contact.relationLabels.join("、") || "关系网联系人";
      const profile = [npc.summary, npc.personality, npc.role ? `身份/职业：${npc.role}` : "", npc.motivation ? `当前动机：${npc.motivation}` : ""]
        .filter(Boolean)
        .join("；");
      return `${redactSourceFileName(npc.name, input.character.sourceFileName)}（${redactSourceFileName(relation, input.character.sourceFileName)}）${profile ? `：${redactSourceFileName(profile, input.character.sourceFileName)}` : ""}`;
    })
    .join("\n");
  const recentSearches = input.phone.browserHistory
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 5)
    .map((entry) => `${redactSourceFileName(entry.title || entry.query, input.character.sourceFileName)}`);
  const recentDiary = input.phone.diaryEntries
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 3)
    .map((entry) => `${redactSourceFileName(entry.title, input.character.sourceFileName)}：${redactSourceFileName(entry.body, input.character.sourceFileName)}`);
  const recentNotes = (input.phone.notes ?? [])
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 3)
    .map((entry) => `${redactSourceFileName(entry.title, input.character.sourceFileName)}：${redactSourceFileName(entry.content, input.character.sourceFileName)}`);
  const recentSchedule = input.phone.scheduleItems
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, 4)
    .map((entry) => `${redactSourceFileName(entry.title, input.character.sourceFileName)}：${redactSourceFileName(entry.detail, input.character.sourceFileName)}`);
  const recentPosts = input.phone.posts
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 4)
    .map((entry) => `${entry.author}：${redactSourceFileName(entry.content, input.character.sourceFileName)}`);
  const recentLifeEvents = (input.phone.lifeEvents ?? [])
    .slice()
    .sort((left, right) => right.generatedAt - left.generatedAt)
    .slice(0, 6)
    .map((event) => `${redactSourceFileName(event.summary, input.character.sourceFileName)}（已落在：${event.artifactRefs.map((artifact) => artifact.app).join("、") || "无"}）`);
  const availableSourceIds = lifeContext.sourceRefs
    .map((source) => `${source.kind}:${source.id}`)
    .slice(0, 80)
    .join("、");
  return [
    `角色资料：${roleDisplayName(input.character)}`,
    `人设：${redactSourceFileName(input.character.personality || "未提供", input.character.sourceFileName)}`,
    `背景：${redactSourceFileName(input.character.backstory || "未提供", input.character.sourceFileName)}`,
    `世界书：${relevantEntries.join("\n") || "未提供"}`,
    `已有联系人：${contacts || "只有与用户的联系"}`,
    `关系网中与角色直接连线的 NPC（这些人可作为角色手机联系人，不代表用户与其聊天）：${networkContacts || "暂无"}`,
    `最近与用户的聊天：${recentChat.join("\n") || "暂无新的聊天"}`,
    `最近朋友圈：${recentMoments.join("\n") || "暂无新的动态"}`,
    `主手机里可参考的文字图描述（只生成文字图，不需要真实图片文件）：${recentTextImages.join("\n") || "暂无文字图"}`,
    `角色手机里最近的联系人对话：${recentPhoneThreads.join("\n") || "暂无对话"}`,
    `角色手机里最近的浏览记录标题：${recentSearches.join("、") || "暂无记录"}`,
    `角色手机里最近的私密日记：${recentDiary.join("\n") || "暂无记录"}`,
    `角色手机里最近的备忘录：${recentNotes.join("\n") || "暂无记录"}`,
    `角色手机里最近的日程：${recentSchedule.join("\n") || "暂无记录"}`,
    `角色手机里最近的朋友圈：${recentPosts.join("\n") || "暂无记录"}`,
    `角色手机里已经记录的生活事件（除非有新的证据，不要重复）：${recentLifeEvents.join("\n") || "暂无记录"}`,
    `可引用的证据来源ID：${availableSourceIds || "暂无"}`,
  ].join("\n");
}

function parseContactDrafts(
  value: unknown,
  character: Character,
  sourceFileName?: string,
  context = "",
): GeneratedContactDraft[] {
  if (!Array.isArray(value)) return [];
  const drafts: GeneratedContactDraft[] = [];
  const sourceStem = sourceFileName?.replace(/\.[^/.]+$/, "").trim();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const candidate = item as Record<string, unknown>;
    const name = cleanText(candidate.name, sourceFileName, 40);
    const relation = cleanText(candidate.relation, sourceFileName, 80);
    if (!name || name === character.name || name === sourceStem || name === "这个角色" || name === "角色") continue;
    if (!context.includes(name)) continue;
    if (drafts.some((draft) => draft.name.toLocaleLowerCase() === name.toLocaleLowerCase())) continue;
    const kind = candidate.kind === "group" || /群聊|群组/.test(relation) ? "group" : "npc";
    const memberNames = Array.isArray(candidate.memberNames)
      ? candidate.memberNames.map((member) => cleanText(member, sourceFileName, 40)).filter(Boolean).slice(0, 20)
      : undefined;
    drafts.push({ name, relation: relation || "联系人", isLongTerm: candidate.isLongTerm !== false, kind, memberNames });
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
  sourceRefs: CharacterPhoneContact["sourceRefs"],
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
      kind: draft.kind ?? "npc",
      isLongTerm: draft.isLongTerm !== false,
      isNpc: true,
      source: "generated",
      memberNames: draft.memberNames,
      sourceRefs,
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

function normalizeArtifactText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Hidden-album items must have an explicit private cue. This keeps ordinary
 * public photos in the main album and prevents the generator from treating
 * every generated image description as secret material.
 */
function isPrivateGalleryEvidence(value: string): boolean {
  return /私密|隐秘|秘密|不公开|仅自己|不能让人看|不想让别人看到|藏起来|私藏|锁屏|偷偷保存|私人|只给自己看|private|secret|personal|intimate|only me/iu.test(value);
}

export type CharacterPhoneGenerationNoChangeReason =
  | "missing_api_config"
  | "provider_error"
  | "invalid_response"
  | "missing_evidence"
  | "duplicate_content"
  | "context_synced";

export interface CharacterPhoneGenerationResult {
  phone: CharacterPhoneRecord;
  status: "generated" | "no_change";
  reason?: CharacterPhoneGenerationNoChangeReason;
  createdCount: number;
}

type CharacterPhoneProgressionInput = {
  phone: CharacterPhoneRecord;
  character: Character;
  characters?: Character[];
  activeIdentity?: UserIdentity;
  relationships?: CharacterRelationship[];
  messages?: Message[];
  moments?: Moment[];
  worldBookEntries?: WorldBookEntry[];
  relationshipNetworkNpcs?: RelationshipNetworkNpc[];
  relationshipNetworkMaps?: RelationshipNetworkMap[];
  musicTracks?: MusicTrack[];
  settings?: UserSettings;
  now?: number;
};

/**
 * Advances the phone and keeps the reason for a no-op separate from the
 * resulting record. The public compatibility wrapper below still returns
 * only a record for callers that do not need diagnostics.
 */
export async function advanceCharacterPhoneWithResult(
  input: CharacterPhoneProgressionInput,
): Promise<CharacterPhoneGenerationResult> {
  const now = input.now ?? Date.now();
  const characters = input.characters ?? [input.character];
  const relationships = input.relationships ?? [];
  const messages = input.messages ?? [];
  const moments = input.moments ?? [];
  const worldBookEntries = input.worldBookEntries ?? [];
  const relationshipNetworkContacts = listCharacterPhoneRelationshipNetworkContacts({
    character: input.character,
    ownerIdentityId: input.phone.ownerIdentityId,
    characters,
    npcs: input.relationshipNetworkNpcs || [],
    maps: input.relationshipNetworkMaps || [],
  });
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
        relationshipNetworkNpcs: input.relationshipNetworkNpcs,
        relationshipNetworkMaps: input.relationshipNetworkMaps,
        musicTracks: input.musicTracks,
        now,
      })
    : input.phone;
  const base: CharacterPhoneRecord = {
    ...contextualPhone,
    lastOpenedAt: contextualPhone.lastOpenedAt,
    updatedAt: now,
    scheduleItems: contextualPhone.scheduleItems ?? [],
    galleryItems: contextualPhone.galleryItems ?? [],
    contacts: contextualPhone.contacts ?? [],
    threadMessages: contextualPhone.threadMessages ?? [],
    posts: contextualPhone.posts ?? [],
  };

  // No API means no invented diary, schedule, search, contact, or chat. The
  // phone keeps real synchronized data instead of falling back to templates.
  if (!input.settings?.apiKey || !input.settings.selectedModel) {
    return { phone: base, status: "no_change", reason: "missing_api_config", createdCount: 0 };
  }

  const context = buildRecentContext({
    character: input.character,
    phone: base,
    activeIdentity: input.activeIdentity,
    relationships,
    messages,
    moments,
    worldBookEntries,
    relationshipNetworkNpcs: input.relationshipNetworkNpcs,
    relationshipNetworkMaps: input.relationshipNetworkMaps,
  });
  const lifeContext = buildCharacterPhoneLifeContext({
    character: input.character,
    phone: base,
    activeIdentity: input.activeIdentity,
    relationships,
    messages,
    moments,
    worldBookEntries,
    relationshipNetworkContacts,
  });
  const textImageEvidence = collectTextImageEvidence(lifeContext);
  const roleName = roleDisplayName(input.character);
  let response;
  try {
    response = await apiChat({
      message: `请根据下面这份“角色当前生活上下文”，先选定一个有证据的生活事件，再生成 2—4 条彼此呼应的手机痕迹。你是在模拟一个真实的人，而不是给应用填充示例数据。只返回 JSON，不要 Markdown：{"lifeEventSummary":"本次所有痕迹共同围绕的具体事件","lifeEventAtHoursAgo":2,"evidenceSourceIds":["chat:真实ID"],"contacts":[{"name":"有依据的联系人或群聊名称","relation":"与角色的关系","kind":"npc或group","memberNames":["有依据的群成员"],"isLongTerm":true}],"threadContactName":"本次联系人对话对应的联系人或群聊名称","threadIncoming":"联系人或群成员发给角色的一句话","threadOutgoing":"角色发给该联系人或群聊的一句话","callContactName":"有证据且已存在的通话联系人","callDirection":"incoming、outgoing或missed","callDurationSeconds":120,"searchQuery":"与该事件直接相关的搜索词","searchTitle":"搜索记录标题","searchResults":[{"platform":"平台名称","title":"该平台结果标题","snippet":"该平台对这次搜索的 AI 摘要"}],"searchReflection":"角色搜索后的一两句私下心声","diaryTitle":"角色关于该事件的私密日记标题","diaryBody":"角色关于该事件的私密想法","noteTitle":"与该事件相关的备忘录标题","noteContent":"备忘录内容","todoText":"该事件确实产生的待办","scheduleTitle":"该事件对应的具体日程标题","scheduleDetail":"具体日程详情","scheduleAtHours":5,"postContent":"角色可能就该事件发布的朋友圈内容","galleryTitle":"该事件中角色保存的相册标题","galleryCaption":"相册图片描述","hiddenGalleryTitle":"有明确私密证据时才填写的隐藏相册标题","hiddenGalleryCaption":"有明确私密证据时才填写的隐藏相册图片描述"}\n若有“主手机里可参考的文字图描述”，优先把它作为角色相册中的文字图素材；galleryCaption 只写画面描述，不要生成真实图片、data URL 或文件名。searchResults 仅在 searchQuery/searchTitle 有明确证据时填写 2—3 条不同平台的结果；平台名、标题和摘要都由你根据角色上下文生成，不要输出网址、外部链接或“查看原始页面”按钮。searchReflection 只在 searchQuery/searchTitle 有明确证据时填写：它是角色刚搜完后的私下反应，不是百科摘要或旁白。hiddenGalleryTitle/hiddenGalleryCaption 只有在证据明确包含私密、隐秘、秘密、仅自己可见等内容时才填写，否则必须为空。若没有足够依据生成某个字段，返回空字符串或空数组。`,
      history: [],
      systemInstruction: `你扮演真实存在的角色“${roleName}”，正在整理他自己的手机。\n${context}\n\n严格规则：
1. 所有内容必须来自角色人设、世界书、最近上下文或已有手机记录的合理延伸；不能凭空制造与角色无关的人和事件。
2. 联系人只能是角色现实中可能认识的人：用户、已有角色关系、世界书/人设明确提到的家人朋友同事，或有明确依据的新 NPC。群聊必须有明确的群名称或成员依据。不要读取或生成用户不认识该角色的好友。
3. threadContactName 必须对应 contacts 或已有联系人；无法判断具体联系人就不要生成聊天字段。不要把联系人聊天塞进用户与角色的聊天镜像。
4. 内容要像真实手机记录：可以不完整、延迟、含蓄或不规律，不要每个应用都强行生成一条，不要使用“角色的日常”“角色需要记住的事”“又想了一下”等模板标题。
5. 角色真实姓名、备注名和人设文件名是不同概念。绝不能把文件名、输入字段名、世界书标题当作角色姓名或正文内容。
6. 日记必须是角色不会公开展示的私密想法；备忘录和日程必须是具体事项；浏览器输出搜索记录标题和 2—3 条不同平台的 AI 结果卡片，不能输出网址或引导查看原始页面；相册字段只描述角色真实可能保存的图片或文字图，不要凭空输出图片文件名。主手机的文字图只以描述形式参考，角色手机会在本地渲染文字图，不要声称有真实照片。
7. lifeEventSummary 必须是本次唯一的生活事件；生成的 2—4 个应用字段必须是这个事件在不同应用中的自然痕迹，时间和人物不能互相矛盾。
8. searchReflection 必须是 1—3 句、约 15—90 字的第一人称私下反应：回答“为什么偏偏现在搜”“哪一点马上有用”“还有什么没想通或准备怎么做”。允许短句、停顿、犹豫、自我纠正和轻微情绪，必须贴合角色口吻与当下事件；不要复述搜索词，不要写成百科总结、心理分析、鸡汤或“我查这个是为了……”模板，也不要提到 AI、提示词或应用规则。若没有明确搜索动机就留空。
9. evidenceSourceIds 只能从“可引用的证据来源ID”原样选择；没有证据就返回空数组，不得编造 ID。
10. 隐藏相册字段只允许承载明确私密/隐秘证据，且生成的条目必须是 hidden=true 的私藏文字图；普通日常、公开动态和普通聊天图片不得放入隐藏相册。
11. 每次最多选择 2—4 个最有依据的字段生成，其余全部留空；宁可少写，不要为了填满字段编造内容。
12. 不要生成解释、旁白、占位符、统一问候或应用说明；只返回 JSON。`,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
      streamCompatible: input.settings.streamCompatible,
    });
  } catch {
    return { phone: base, status: "no_change", reason: "provider_error", createdCount: 0 };
  }

  let raw: GeneratedPhonePayload;
  try {
    raw = parseJson(response.text) as GeneratedPhonePayload;
  } catch {
    return { phone: base, status: "no_change", reason: "invalid_response", createdCount: 0 };
  }

  const sourceFileName = input.character.sourceFileName;
  const allowedSources = new Map(lifeContext.sourceRefs.map((source) => [`${source.kind}:${source.id}`, source]));
  const requestedSourceIds = Array.isArray(raw.evidenceSourceIds)
    ? raw.evidenceSourceIds.filter((value): value is string => typeof value === "string")
    : [];
  const validatedSourceRefs = requestedSourceIds
    .map((id) => allowedSources.get(id))
    .filter((source): source is NonNullable<typeof source> => Boolean(source));
  // A phone trace is a projection of evidence, not a new Truth-layer fact.
  // If the provider cannot point at any scoped source, keep the phone unchanged.
  if (validatedSourceRefs.length === 0) {
    return { phone: base, status: "no_change", reason: "missing_evidence", createdCount: 0 };
  }
  const contactEvidenceText = [
    input.character.personality,
    input.character.backstory,
    ...lifeContext.worldBookEntries.map((entry) => entry.content),
    ...base.contacts.flatMap((contact) => [contact.name, contact.remark, ...(contact.memberNames ?? [])]),
  ].filter(Boolean).join("\n");
  const contactDrafts = parseContactDrafts(raw.contacts, input.character, sourceFileName, contactEvidenceText);
  const mergedContacts = mergeGeneratedContacts(base, contactDrafts, validatedSourceRefs);
  const requestedThreadContact = cleanGeneratedText(raw.threadContactName, sourceFileName, 40);
  const threadContact = findThreadContact(mergedContacts.contacts, requestedThreadContact, mergedContacts.added);
  const incoming = cleanGeneratedText(raw.threadIncoming || raw.threadMessage, sourceFileName);
  const outgoing = cleanGeneratedText(raw.threadOutgoing || raw.message, sourceFileName);
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
    phoneCalls: [...(base.phoneCalls ?? [])],
    lifeEvents: [...(base.lifeEvents ?? [])],
  };
  let generated = mergedContacts.added.length > 0;
  const lifeEventId = createId("phone-life-event");
  const artifactRefs: CharacterPhoneLifeEvent["artifactRefs"] = [];
  const artifactApps = new Set<CharacterPhoneLifeEvent["artifactRefs"][number]["app"]>();
  const pushArtifact = <T extends { id: string; lifeEventId?: string }>(
    app: CharacterPhoneLifeEvent["artifactRefs"][number]["app"],
    items: T[],
    item: T,
    signature: (value: T) => string,
  ) => {
    if (items.some((existing) => signature(existing) === signature(item))) return false;
    if (!artifactApps.has(app) && artifactApps.size >= 4) return false;
    item.lifeEventId = lifeEventId;
    items.push(item);
    artifactApps.add(app);
    artifactRefs.push({ app, id: item.id });
    generated = true;
    return true;
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
      pushArtifact("chat", next.threadMessages, message, (value) => `${value.contactId}|${value.sender}|${normalizeArtifactText(value.content)}`);
    }
    if (hasText(outgoing)) {
      const message: CharacterPhoneThreadMessage = {
        id: createId("phone-life-thread-outgoing"),
        contactId: threadContact.id,
        sender: "character",
        content: outgoing,
        timestamp: now,
      };
      pushArtifact("chat", next.threadMessages, message, (value) => `${value.contactId}|${value.sender}|${normalizeArtifactText(value.content)}`);
    }
  }

  const callContactName = cleanGeneratedText(raw.callContactName, sourceFileName, 40);
  const callContact = callContactName
    ? mergedContacts.contacts.find((contact) => !contact.removedAt && contactKey(contact.name) === contactKey(callContactName))
    : undefined;
  const callDirection = raw.callDirection === "incoming" || raw.callDirection === "outgoing" || raw.callDirection === "missed"
    ? raw.callDirection
    : undefined;
  if (callContact && callDirection) {
    const durationSeconds = typeof raw.callDurationSeconds === "number" && Number.isFinite(raw.callDurationSeconds)
      ? Math.max(0, Math.min(24 * 60 * 60, Math.round(raw.callDurationSeconds)))
      : undefined;
    const call: CharacterPhoneCallRecord = {
      id: createId("phone-life-call"),
      contactId: callContact.id,
      contactName: callContact.remark || callContact.name,
      direction: callDirection,
      timestamp: now - 3 * 60 * 1000,
      ...(callDirection !== "missed" && durationSeconds !== undefined ? { durationSeconds } : {}),
    };
    pushArtifact("phone", next.phoneCalls ?? (next.phoneCalls = []), call, (value) => `${value.contactId}|${value.direction}|${value.timestamp}`);
  }

  const searchQuery = cleanGeneratedText(raw.searchQuery, sourceFileName, 180);
  const searchTitle = cleanGeneratedText(raw.searchTitle, sourceFileName, 180) || deriveGeneratedTitle(searchQuery, sourceFileName);
  if (searchQuery || searchTitle) {
    const searchResults = parseGeneratedBrowserResults(raw.searchResults, sourceFileName);
    const searchReflection = cleanGeneratedText(raw.searchReflection ?? raw.reflection, sourceFileName, 240);
    const entryBase = {
      id: createId("phone-life-search"),
      query: searchQuery || searchTitle,
      title: searchTitle || searchQuery,
      timestamp: now - 8 * 60 * 1000,
      ...(searchResults.length >= 2 ? { results: searchResults } : {}),
      ...(searchReflection ? { reflection: searchReflection } : {}),
    };
    const entry = { ...entryBase, ...buildCharacterPhoneBrowserDetail(entryBase, roleName) };
    pushArtifact("browser", next.browserHistory, entry, (value) => `${normalizeArtifactText(value.query)}|${normalizeArtifactText(value.title)}`);
  }
  const diaryBody = cleanGeneratedText(raw.diaryBody, sourceFileName);
  const diaryTitle = cleanGeneratedText(raw.diaryTitle, sourceFileName, 160) || deriveGeneratedTitle(diaryBody, sourceFileName);
  if (diaryTitle || diaryBody) {
    const entry: CharacterPhoneDiaryEntry = { id: createId("phone-life-diary"), title: diaryTitle || diaryBody.slice(0, 24), body: diaryBody, timestamp: now - 12 * 60 * 1000 };
    pushArtifact("diary", next.diaryEntries, entry, (value) => `${normalizeArtifactText(value.title)}|${normalizeArtifactText(value.body)}`);
  }
  const noteContent = cleanGeneratedText(raw.noteContent, sourceFileName);
  const noteTitle = cleanGeneratedText(raw.noteTitle, sourceFileName, 160) || deriveGeneratedTitle(noteContent, sourceFileName);
  if (noteTitle || noteContent) {
    const entry: CharacterPhoneNote = { id: createId("phone-life-note"), title: noteTitle || noteContent.slice(0, 24), content: noteContent, timestamp: now - 10 * 60 * 1000 };
    pushArtifact("notes", next.notes ?? (next.notes = []), entry, (value) => `${normalizeArtifactText(value.title)}|${normalizeArtifactText(value.content)}`);
  }
  const todoText = cleanGeneratedText(raw.todoText, sourceFileName, 180);
  if (todoText) {
    const entry: CharacterPhoneTodo = { id: createId("phone-life-todo"), text: todoText, checked: false, source: "generated" };
    pushArtifact("notes", next.todos ?? (next.todos = []), entry, (value) => normalizeArtifactText(value.text));
  }
  const scheduleDetail = cleanGeneratedText(raw.scheduleDetail, sourceFileName);
  const scheduleTitle = cleanGeneratedText(raw.scheduleTitle, sourceFileName, 160) || deriveGeneratedTitle(scheduleDetail, sourceFileName);
  if (scheduleTitle || scheduleDetail) {
    const hours = typeof raw.scheduleAtHours === "number" && Number.isFinite(raw.scheduleAtHours)
      ? Math.max(1, Math.min(72, raw.scheduleAtHours))
      : 5;
    const entry: CharacterPhoneScheduleItem = { id: createId("phone-life-schedule"), title: scheduleTitle || scheduleDetail.slice(0, 24), detail: scheduleDetail, timestamp: now + hours * 60 * 60 * 1000 };
    pushArtifact("schedule", next.scheduleItems, entry, (value) => `${value.title}|${value.detail}|${value.timestamp}`);
  }
  const requestedGalleryCaption = cleanGeneratedText(raw.galleryCaption, sourceFileName);
  const requestedGalleryTitle = cleanGeneratedText(raw.galleryTitle, sourceFileName, 160);
  const referencedTextImage = !requestedGalleryCaption && !requestedGalleryTitle
    ? textImageEvidence
      .slice()
      .reverse()
      .find((item) => validatedSourceRefs.some((source) => source.kind === item.sourceKind && source.id === item.sourceId))
    : undefined;
  const galleryCaption = requestedGalleryCaption || referencedTextImage?.description || "";
  const galleryTitle = requestedGalleryTitle
    || deriveGeneratedTitle(galleryCaption, sourceFileName)
    || (referencedTextImage ? referencedTextImage.label : "");
  if (galleryTitle || galleryCaption) {
    const textImageTitle = normalizeGalleryTextImageTitle(galleryTitle || galleryCaption.slice(0, 24));
    const entry: CharacterPhoneGalleryItem = {
      id: createId("phone-life-gallery"),
      title: textImageTitle,
      caption: galleryCaption || galleryTitle,
      timestamp: now - 25 * 60 * 1000,
      source: "generated",
      textImageForId: `phone-life-gallery-${lifeEventId}`,
      dataUrl: createCharacterPhoneTextImageDataUrl(galleryCaption || galleryTitle, galleryTitle),
      ...(referencedTextImage ? { sourceId: referencedTextImage.sourceId } : {}),
    };
    pushArtifact("gallery", next.galleryItems, entry, (value) => `${normalizeArtifactText(value.title)}|${normalizeArtifactText(value.caption)}`);
  }
  const requestedHiddenGalleryCaption = cleanGeneratedText(raw.hiddenGalleryCaption, sourceFileName);
  const requestedHiddenGalleryTitle = cleanGeneratedText(raw.hiddenGalleryTitle, sourceFileName, 160);
  const validatedPrivateTextImage = textImageEvidence
    .slice()
    .reverse()
    .find((item) => validatedSourceRefs.some((source) => source.kind === item.sourceKind && source.id === item.sourceId)
      && isPrivateGalleryEvidence(item.description));
  const hiddenGalleryCaption = requestedHiddenGalleryCaption || validatedPrivateTextImage?.description || "";
  const hiddenGalleryTitle = requestedHiddenGalleryTitle
    || (validatedPrivateTextImage ? `${validatedPrivateTextImage.label} · 私藏` : "");
  if ((hiddenGalleryTitle || hiddenGalleryCaption) && isPrivateGalleryEvidence(`${hiddenGalleryTitle} ${hiddenGalleryCaption}`)) {
    const textImageTitle = normalizeGalleryTextImageTitle(hiddenGalleryTitle || hiddenGalleryCaption.slice(0, 24));
    const entry: CharacterPhoneGalleryItem = {
      id: createId("phone-life-hidden-gallery"),
      title: textImageTitle,
      caption: hiddenGalleryCaption || hiddenGalleryTitle,
      timestamp: now - 20 * 60 * 1000,
      hidden: true,
      source: "generated",
      textImageForId: `phone-life-hidden-gallery-${lifeEventId}`,
      dataUrl: createCharacterPhoneTextImageDataUrl(hiddenGalleryCaption || hiddenGalleryTitle, hiddenGalleryTitle),
      ...(validatedPrivateTextImage ? { sourceId: validatedPrivateTextImage.sourceId } : {}),
    };
    pushArtifact("gallery", next.galleryItems, entry, (value) => `${normalizeArtifactText(value.title)}|${normalizeArtifactText(value.caption)}|${value.hidden ? "hidden" : "main"}`);
  }
  const postContent = cleanGeneratedText(raw.postContent, sourceFileName);
  if (postContent) {
    const entry: CharacterPhonePost = { id: createId("phone-life-post"), author: roleName, authorId: input.character.id, authorAvatar: input.character.avatar, content: postContent, timestamp: now - 2 * 60 * 1000, likes: 0, comments: [], source: "generated", visibility: "public" };
    pushArtifact("moments", next.posts, entry, (value) => normalizeArtifactText(value.content));
  }

  if (artifactRefs.length > 0) {
    const rawHoursAgo = typeof raw.lifeEventAtHoursAgo === "number" && Number.isFinite(raw.lifeEventAtHoursAgo)
      ? raw.lifeEventAtHoursAgo
      : 0;
    const startedAt = now - Math.max(0, Math.min(72, rawHoursAgo)) * 60 * 60 * 1000;
    const fallbackSummary = incoming || outgoing || scheduleTitle || diaryTitle || noteTitle || searchTitle || postContent || galleryTitle || todoText;
    const summary = cleanGeneratedText(raw.lifeEventSummary, sourceFileName, 240) || fallbackSummary.slice(0, 240);
    next.lifeEvents?.push({ id: lifeEventId, summary, startedAt, generatedAt: now, sourceRefs: validatedSourceRefs, artifactRefs });
  }

  if (generated) {
    return {
      phone: { ...next, lastGeneratedAt: now, updatedAt: now },
      status: "generated",
      createdCount: artifactRefs.length + mergedContacts.added.length,
    };
  }
  return {
    phone: base,
    status: "no_change",
    reason: contextualPhone !== input.phone ? "context_synced" : "duplicate_content",
    createdCount: 0,
  };
}

/** Backwards-compatible record-only API used by existing generation tests. */
export async function advanceCharacterPhone(
  input: CharacterPhoneProgressionInput,
): Promise<CharacterPhoneRecord> {
  const result = await advanceCharacterPhoneWithResult(input);
  return result.phone;
}
