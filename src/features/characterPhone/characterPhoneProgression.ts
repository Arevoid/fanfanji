import { apiChat } from "../../utils/apiHelper";
import { createId } from "../../core/id/createId";
import type { Character, Message, Moment, MusicTrack, UserIdentity, UserSettings, WorldBookEntry } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import type { RelationshipNetworkMap, RelationshipNetworkNpc } from "../../domain/relationshipNetwork/relationshipNetworkTypes";
import type {
  CharacterPhoneContact,
  CharacterPhoneGeneratedAppId,
  CharacterPhoneDiaryEntry,
  CharacterPhoneGalleryItem,
  CharacterPhoneLifeEvent,
  CharacterPhoneNote,
  CharacterPhoneCallRecord,
  CharacterPhoneBrowserResult,
  CharacterPhoneListeningRecord,
  CharacterPhoneMusicPlaylist,
  CharacterPhoneMusicTrack,
  CharacterPhonePost,
  CharacterPhoneRecord,
  CharacterPhoneSourceRef,
  CharacterPhoneScheduleItem,
  CharacterPhoneThreadMessage,
  CharacterPhoneTodo,
} from "../../domain/characterPhone/types";
import { CHARACTER_PHONE_GENERATABLE_APPS } from "../../domain/characterPhone/types";
import { parseTextImageDescription } from "../chat/services/messageParser";
import { cleanAndExtractMoment } from "../moments/services/momentContent";
import { ensureCharacterPhoneContent, hasCompleteCharacterPhoneContactThread } from "./characterPhoneContent";
import { buildCharacterPhoneBrowserDetail } from "./characterPhoneBrowserDetails";
import { buildCharacterPhoneLifeContext, type CharacterPhoneLifeContext } from "./characterPhoneLifeContext";
import { listCharacterPhoneRelationshipNetworkContacts } from "./characterPhoneRelationshipNetwork";
import { resolveCanonicalCharacterId } from "../../domain/character/characterIdentity";
import { createCharacterPhoneTextImageDataUrl } from "./characterPhoneTextImage";
import { createCharacterPhoneInitialAvatar, normalizeCharacterPhoneContactName } from "./characterPhoneContactVisuals";
import {
  getCharacterPhoneGenerationCooldowns,
  recordCharacterPhoneGenerationCooldowns,
} from "./characterPhoneGenerationCooldown";

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
  threadMessages?: unknown;
  /** Direct conversation between the role and the owner of the phone. */
  userThreadMessages?: unknown;
  /** Optional independent threads for more than one NPC/contact. */
  contactThreads?: unknown;
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
  browserEntries?: unknown;
  /** Legacy provider key accepted for browser heart-voice migration. */
  reflection?: unknown;
  diaryTitle?: unknown;
  diaryBody?: unknown;
  diaryEntries?: unknown;
  noteTitle?: unknown;
  noteContent?: unknown;
  noteEntries?: unknown;
  todoText?: unknown;
  todoEntries?: unknown;
  scheduleTitle?: unknown;
  scheduleDetail?: unknown;
  scheduleAtHours?: unknown;
  scheduleItems?: unknown;
  callContactName?: unknown;
  callDirection?: unknown;
  callDurationSeconds?: unknown;
  phoneCalls?: unknown;
  postContent?: unknown;
  posts?: unknown;
  galleryTitle?: unknown;
  galleryCaption?: unknown;
  galleryEntries?: unknown;
  hiddenGalleryTitle?: unknown;
  hiddenGalleryCaption?: unknown;
  musicTracks?: unknown;
  musicListening?: unknown;
  musicNowPlaying?: unknown;
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

function generatedRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is Record<string, unknown> => Boolean(candidate && typeof candidate === "object" && !Array.isArray(candidate)));
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseGeneratedThreadMessages(value: unknown, sourceFileName?: string): Array<{ sender: "contact" | "character"; content: string }> {
  return generatedRecords(value).flatMap((record) => {
    const sender: "contact" | "character" = record.sender === "character" || record.from === "character" ? "character" : "contact";
    const content = cleanGeneratedText(record.content ?? record.message ?? record.text, sourceFileName);
    return content ? [{ sender, content }] : [];
  }).slice(0, 6);
}

function parseGeneratedBrowserEntries(value: unknown, sourceFileName?: string): Array<{
  query: string;
  title: string;
  results: CharacterPhoneBrowserResult[];
  reflection: string;
}> {
  return generatedRecords(value).flatMap((record) => {
    const query = cleanGeneratedText(record.query ?? record.searchQuery, sourceFileName, 180);
    const title = cleanGeneratedText(record.title ?? record.searchTitle, sourceFileName, 180);
    const reflection = cleanGeneratedText(record.reflection ?? record.searchReflection, sourceFileName, 240);
    if (!query && !title) return [];
    return [{
      query: query || title,
      title: title || query,
      results: parseGeneratedBrowserResults(record.results ?? record.searchResults, sourceFileName),
      reflection,
    }];
  }).slice(0, 8);
}

function parseGeneratedDiaryEntries(value: unknown, sourceFileName?: string): Array<{ title: string; body: string; hidden: boolean }> {
  return generatedRecords(value).flatMap((record) => {
    const body = cleanGeneratedText(record.body ?? record.content, sourceFileName);
    const title = cleanGeneratedText(record.title, sourceFileName, 160) || deriveGeneratedTitle(body, sourceFileName);
    return title || body ? [{ title: title || body.slice(0, 24), body, hidden: record.hidden === true }] : [];
  }).slice(0, 4);
}

function parseGeneratedNoteEntries(value: unknown, sourceFileName?: string): Array<{ title: string; content: string }> {
  return generatedRecords(value).flatMap((record) => {
    const content = cleanGeneratedText(record.content ?? record.body, sourceFileName);
    const title = cleanGeneratedText(record.title, sourceFileName, 160) || deriveGeneratedTitle(content, sourceFileName);
    return title || content ? [{ title: title || content.slice(0, 24), content }] : [];
  }).slice(0, 4);
}

function parseGeneratedTodoEntries(value: unknown, sourceFileName?: string): Array<{ text: string; dueAt?: number }> {
  return generatedRecords(value).flatMap((record) => {
    const text = cleanGeneratedText(record.text ?? record.content ?? record.title, sourceFileName, 180);
    const dueAt = finiteNumber(record.dueAt);
    return text ? [{ text, ...(dueAt !== undefined ? { dueAt } : {}) }] : [];
  }).slice(0, 4);
}

function parseGeneratedScheduleItems(value: unknown, sourceFileName?: string): Array<{ title: string; detail: string; daysFromNow?: number; hoursFromNow?: number }> {
  return generatedRecords(value).flatMap((record) => {
    const detail = cleanGeneratedText(record.detail ?? record.content, sourceFileName);
    const title = cleanGeneratedText(record.title, sourceFileName, 160) || deriveGeneratedTitle(detail, sourceFileName);
    const daysFromNow = finiteNumber(record.daysFromNow ?? record.dayOffset);
    const hoursFromNow = finiteNumber(record.hoursFromNow ?? record.atHours ?? record.scheduleAtHours);
    return title || detail ? [{ title: title || detail.slice(0, 24), detail, ...(daysFromNow !== undefined ? { daysFromNow } : {}), ...(hoursFromNow !== undefined ? { hoursFromNow } : {}) }] : [];
  }).slice(0, 6);
}

function parseGeneratedPosts(value: unknown, sourceFileName?: string): Array<{ content: string; visibility: "public" | "private" | "user" | "specific"; visibilityTargetIds?: string[] }> {
  return generatedRecords(value).flatMap((record) => {
    const content = cleanGeneratedText(record.content ?? record.body, sourceFileName);
    const visibility: "public" | "private" | "user" | "specific" = record.visibility === "private" || record.visibility === "user" || record.visibility === "specific" ? record.visibility : "public";
    const targets = Array.isArray(record.visibilityTargetIds)
      ? record.visibilityTargetIds.filter((id): id is string => typeof id === "string").slice(0, 12)
      : [];
    return content ? [{ content, visibility, ...(targets.length > 0 ? { visibilityTargetIds: targets } : {}) }] : [];
  }).slice(0, 4);
}

function parseGeneratedMusicTracks(value: unknown, sourceFileName?: string): Array<{ title: string; artist: string; duration: string; playCount?: number; playedHoursAgo?: number; current?: boolean }> {
  return generatedRecords(value).flatMap((record) => {
    const title = cleanGeneratedText(record.title ?? record.name, sourceFileName, 120);
    const artist = cleanGeneratedText(record.artist ?? record.singer, sourceFileName, 80);
    const duration = cleanGeneratedText(record.duration, sourceFileName, 12) || "3:30";
    const playCount = finiteNumber(record.playCount);
    const playedHoursAgo = finiteNumber(record.playedHoursAgo ?? record.hoursAgo);
    return title ? [{ title, artist: artist || "未知艺术家", duration, ...(playCount !== undefined ? { playCount } : {}), ...(playedHoursAgo !== undefined ? { playedHoursAgo } : {}), ...(record.current === true ? { current: true } : {}) }] : [];
  }).slice(0, 8);
}

function parseGeneratedMusicListening(value: unknown): Array<{ trackTitle?: string; trackIndex?: number; playedHoursAgo?: number; durationSeconds?: number; playCount?: number }> {
  return generatedRecords(value).map((record) => ({
    ...(typeof record.trackTitle === "string" ? { trackTitle: record.trackTitle } : {}),
    ...(finiteNumber(record.trackIndex) !== undefined ? { trackIndex: finiteNumber(record.trackIndex) } : {}),
    ...(finiteNumber(record.playedHoursAgo ?? record.hoursAgo) !== undefined ? { playedHoursAgo: finiteNumber(record.playedHoursAgo ?? record.hoursAgo) } : {}),
    ...(finiteNumber(record.durationSeconds) !== undefined ? { durationSeconds: finiteNumber(record.durationSeconds) } : {}),
    ...(finiteNumber(record.playCount) !== undefined ? { playCount: finiteNumber(record.playCount) } : {}),
  })).slice(0, 16);
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
  characters?: Character[];
  activeIdentity?: UserIdentity;
  identities?: UserIdentity[];
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
      const relation = message.relationId
        ? lifeContext.relationships.find((candidate) => candidate.id === message.relationId)
        : undefined;
      const identity = relation
        ? input.identities?.find((candidate) => candidate.id === relation.userIdentityId)
        : message.authorIdentityId
          ? input.identities?.find((candidate) => candidate.id === message.authorIdentityId)
          : undefined;
      const sender = message.sender === "user"
        ? identity?.name || "用户"
        : roleDisplayName(input.character);
      return `${sender}：${redactSourceFileName(content, input.character.sourceFileName)}`;
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
      const content = message.recalledAt ? "你撤回了一条信息" : message.content;
      return `${message.sender === "character" ? roleDisplayName(input.character) : contact?.name || "联系人"}：${redactSourceFileName(content, input.character.sourceFileName)}`;
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

function isContextuallySupportedContact(name: string, relation: string, context: string): boolean {
  const evidence = context.toLocaleLowerCase();
  const candidate = `${name} ${relation}`.toLocaleLowerCase();
  const scenarios: Array<{ evidence: RegExp; contact: RegExp }> = [
    { evidence: /求婚|婚礼|订婚|结婚|婚庆|钻戒|婚戒|婚纱|婚房/, contact: /婚|酒店|钻石|戒指|婚纱|宴会|策划|场地/ },
    { evidence: /旅行|旅游|度假|出差|机票|车票|酒店|返程/, contact: /旅行|旅游|导游|酒店|票务|航班|车站|租车/ },
    { evidence: /生病|发烧|医院|体检|检查|看诊|吃药|复诊/, contact: /医生|护士|诊所|医院|药师|药店|检验/ },
    { evidence: /面试|工作|项目|加班|辞职|升职|客户|合同|入职/, contact: /同事|客户|经理|人事|hr|招聘|项目|法务/ },
    { evidence: /搬家|装修|租房|买房|房子|搬到|搬去/, contact: /房产|中介|房东|装修|物业|搬家/ },
    { evidence: /考试|上学|毕业|论文|选课|补课/, contact: /老师|同学|导师|教务|辅导|培训/ },
    { evidence: /生日|聚会|见面|散步|电影|吃饭|约好|邀请|礼物/, contact: /朋友|家人|同事|同学|店员|摄影|预订/ },
  ];
  return scenarios.some((scenario) => scenario.evidence.test(evidence) && scenario.contact.test(candidate));
}

function buildContextualScenarioContacts(context: string): GeneratedContactDraft[] {
  if (/求婚|婚礼|订婚|结婚|婚庆|钻戒|婚戒|婚纱|婚房/.test(context)) {
    return [
      { name: "婚庆顾问", relation: "婚礼筹备服务联系人" },
      { name: "酒店预订顾问", relation: "婚宴场地与档期联系人" },
      { name: "钻石定制顾问", relation: "婚戒定制咨询联系人" },
    ];
  }
  if (/旅行|旅游|度假|出差|机票|车票|酒店|返程/.test(context)) {
    return [
      { name: "旅行顾问", relation: "行程规划联系人" },
      { name: "酒店预订顾问", relation: "住宿安排联系人" },
      { name: "票务顾问", relation: "交通票务联系人" },
    ];
  }
  if (/生病|发烧|医院|体检|检查|看诊|吃药|复诊/.test(context)) {
    return [
      { name: "门诊护士", relation: "就诊流程联系人" },
      { name: "主治医生", relation: "复诊与检查联系人" },
      { name: "药房药师", relation: "用药咨询联系人" },
    ];
  }
  if (/搬家|装修|租房|买房|房子|搬到|搬去/.test(context)) {
    return [
      { name: "房产中介", relation: "租房或看房联系人" },
      { name: "装修顾问", relation: "房屋布置联系人" },
      { name: "物业管家", relation: "入住安排联系人" },
    ];
  }
  if (/面试|工作|项目|加班|辞职|升职|客户|合同|入职/.test(context)) {
    return [
      { name: "项目同事", relation: "工作事项联系人" },
      { name: "客户联系人", relation: "项目沟通联系人" },
      { name: "人事顾问", relation: "面试或入职联系人" },
    ];
  }
  return [];
}

function isInitialNpcConversationContact(contact: CharacterPhoneContact): boolean {
  return !contact.removedAt
    && contact.source !== "user"
    && contact.kind !== "user"
    && contact.kind !== "character"
    && contact.kind !== "group"
    && contact.isNpc !== false;
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
    const name = normalizeCharacterPhoneContactName(cleanText(candidate.name, sourceFileName, 40));
    const relation = cleanText(candidate.relation, sourceFileName, 80);
    if (!name || name === character.name || name === sourceStem || name === "这个角色" || name === "角色") continue;
    if (!context.includes(name) && !isContextuallySupportedContact(name, relation, context)) continue;
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
      avatar: createCharacterPhoneInitialAvatar(draft.name),
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
    const matchingContacts = visibleNpcContacts.filter((contact) => contactKey(contact.name) === contactKey(requestedName));
    return matchingContacts.length === 1 ? matchingContacts[0] : undefined;
  }
  if (newlyAdded.length === 1) return newlyAdded[0];
  return visibleNpcContacts.length === 1 ? visibleNpcContacts[0] : undefined;
}

type GeneratedThreadDraft = { sender: "contact" | "character"; content: string };

type GeneratedContactThreadDraft = {
  contactName: string;
  /** Local deterministic backfills bind by stable contact ID, never display name. */
  contactId?: string;
  messages: GeneratedThreadDraft[];
};

function parseGeneratedContactThreads(
  value: unknown,
  sourceFileName?: string,
): GeneratedContactThreadDraft[] {
  return generatedRecords(value).flatMap((record) => {
    const contactName = cleanGeneratedText(
      record.contactName ?? record.name ?? record.threadContactName,
      sourceFileName,
      80,
    );
    const messages = parseGeneratedThreadMessages(
      record.messages ?? record.threadMessages,
      sourceFileName,
    );
    const contactId = typeof record.contactId === "string" ? record.contactId.trim().slice(0, 160) : "";
    return contactName && messages.length > 0 ? [{ contactName, ...(contactId ? { contactId } : {}), messages }] : [];
  }).slice(0, 12);
}

function parseGeneratedGalleryEntries(value: unknown, sourceFileName?: string): Array<{ title: string; caption: string; hidden: boolean }> {
  return generatedRecords(value).flatMap((record) => {
    const caption = cleanGeneratedText(record.caption ?? record.description ?? record.content, sourceFileName);
    const title = cleanGeneratedText(record.title, sourceFileName, 160) || deriveGeneratedTitle(caption, sourceFileName);
    return title || caption ? [{ title: title || caption.slice(0, 24), caption: caption || title, hidden: record.hidden === true }] : [];
  }).slice(0, 8);
}

function parseGeneratedPhoneCalls(value: unknown, sourceFileName?: string): Array<{ contactName: string; direction: "incoming" | "outgoing" | "missed"; durationSeconds?: number }> {
  return generatedRecords(value).flatMap((record) => {
    const contactName = cleanGeneratedText(record.contactName ?? record.name, sourceFileName, 80);
    const direction: "incoming" | "outgoing" | "missed" | undefined = record.direction === "incoming" || record.direction === "outgoing" || record.direction === "missed"
      ? record.direction
      : undefined;
    const durationSeconds = finiteNumber(record.durationSeconds);
    return contactName && direction
      ? [{ contactName, direction, ...(durationSeconds !== undefined ? { durationSeconds } : {}) }]
      : [];
  }).slice(0, 8);
}

function createGeneratedUserContact(
  phone: CharacterPhoneRecord,
  identity?: UserIdentity,
  relation?: CharacterRelationship,
): CharacterPhoneContact {
  const name = identity?.name?.trim() || "用户";
  return {
    id: `character-phone:${phone.id}:contact:user`,
    name,
    relation: "与角色聊天",
    kind: "user",
    ...(identity?.id ? { userIdentityId: identity.id } : {}),
    ...(relation?.id ? { relationId: relation.id } : {}),
    isLongTerm: true,
    isNpc: false,
    avatar: identity?.avatar || createCharacterPhoneInitialAvatar(name),
    source: "user",
    sourceRefs: identity?.id ? [{ kind: "character", id: identity.id }] : [],
  };
}

function buildInitialContactFallback(
  contact: CharacterPhoneContact,
  lifeEventSummary: string,
  character: Character,
): GeneratedThreadDraft[] {
  if (contact.name.includes("婚庆顾问")) {
    return [
      { sender: "contact", content: "我先按你们想要的氛围整理两套小型婚礼方案，日期和大概人数确定后，预算还能再细化。" },
      { sender: "character", content: "先把周末档期和套餐差异发我吧，我想先跟家里商量好人数，再决定要不要把场地定下来。" },
    ];
  }
  if (contact.name.includes("酒店预订顾问")) {
    return [
      { sender: "contact", content: "周末宴会厅目前还有两个时段可以选，我把场地、餐标和取消规则一起整理给你。" },
      { sender: "character", content: "麻烦先按两边家人都方便的时间查一下，人数还没完全确定，先别替我锁定。" },
    ];
  }
  if (contact.name.includes("钻石定制顾问")) {
    return [
      { sender: "contact", content: "你看中的那类戒托可以做小一号的爪镶，我把尺寸、证书和改圈周期列给你确认。" },
      { sender: "character", content: "先把几种日常佩戴不容易勾衣服的款式发我，预算范围也一起标一下，我想慢慢挑。" },
    ];
  }
  const context = lifeEventSummary ? lifeEventSummary.slice(0, 30) : "刚才那件事";
  const variants = contact.kind === "group"
    ? [
        `群里的${context}先记着，等有空再看。`,
        `关于群里${context}，我晚点再回。`,
        `群里那件${context}，我先处理手上的事。`,
        `我看到群里${context}了，之后再说。`,
      ]
    : [
        `关于${context}，我晚点再跟${contact.name}确认。`,
        `先把${context}记下，忙完再回${contact.name}。`,
        `${contact.name}那边的${context}，我之后再处理。`,
        `我看到${contact.name}关于${context}的消息了，晚点说。`,
      ];
  const outgoing = variants[stableVariantIndex(`${character.id}|${contact.id}|${lifeEventSummary}`, variants.length)];
  const incomingVariants = contact.kind === "group"
    ? ["收到，我晚点再看。", "好，我忙完回复。", "看到了，先记着。", "嗯，之后再说。"]
    : ["你先忙，晚点回我就好。", "好，我等你有空再说。", "看到了，不急，你先处理手上的事。", "行，忙完告诉我一声。"];
  return [
    {
      sender: "contact",
      content: incomingVariants[stableVariantIndex(`${contact.id}|${lifeEventSummary}`, incomingVariants.length)],
    },
    { sender: "character", content: outgoing },
  ];
}

function getValidatedContactEvidenceRefs(
  contact: CharacterPhoneContact,
  input: CharacterPhoneProgressionInput,
  lifeContext: CharacterPhoneLifeContext,
  allowedSources: Map<string, CharacterPhoneSourceRef>,
): CharacterPhoneSourceRef[] {
  const knownCharacters = input.characters ?? [input.character];
  const candidateRefs = [...(contact.sourceRefs ?? [])];
  if (contact.linkedCharacterId) candidateRefs.push({ kind: "character", id: contact.linkedCharacterId });
  if (contact.relationshipNetworkNpcId) candidateRefs.push({ kind: "relationship-network", id: contact.relationshipNetworkNpcId });
  const validated = new Map<string, CharacterPhoneSourceRef>();
  candidateRefs.forEach((source) => {
    const key = `${source.kind}:${source.id}`;
    if (allowedSources.has(key)) {
      validated.set(key, allowedSources.get(key)!);
      return;
    }
    let isKnownInScope = false;
    if (source.kind === "character") {
      const candidate = knownCharacters.find((character) => character.id === source.id);
      isKnownInScope = source.id === input.character.id
        || Boolean(candidate && !candidate.isContactInstance
          && (candidate.ownerIdentityId || "identity-1") === input.phone.ownerIdentityId);
    } else if (source.kind === "worldbook") {
      isKnownInScope = lifeContext.worldBookEntries.some((entry) => entry.id === source.id);
    } else if (source.kind === "chat") {
      isKnownInScope = lifeContext.messages.some((message) => message.id === source.id);
    } else if (source.kind === "moment") {
      isKnownInScope = lifeContext.moments.some((moment) => moment.id === source.id);
    } else if (source.kind === "phone") {
      isKnownInScope = source.id === input.phone.id;
    } else if (source.kind === "relationship-network") {
      isKnownInScope = lifeContext.relationshipNetworkContacts.some((network) => network.npc.id === source.id)
        || (input.relationshipNetworkNpcs ?? []).some((npc) => npc.id === source.id
          && npc.ownerIdentityId === input.phone.ownerIdentityId);
    }
    if (isKnownInScope) validated.set(key, source);
  });
  return [...validated.values()];
}

function stableVariantIndex(value: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

/**
 * Providers sometimes still answer the legacy singular thread fields even
 * when the batch schema is requested. Keep the generated conversation useful:
 * preserve every provider turn, then add only the missing side/turns with
 * role-scoped, varied follow-ups rather than copying the same starter text to
 * every contact.
 */
function completeInitialThreadDrafts(
  drafts: Array<{ sender: "contact" | "character"; content: string }>,
  incoming: string,
  outgoing: string,
  contact: CharacterPhoneContact,
  character: Character,
  lifeEventSummary: string,
): Array<{ sender: "contact" | "character"; content: string }> {
  if (drafts.length === 0 && !incoming && !outgoing) return drafts;
  const variant = stableVariantIndex(
    `${character.id}|${contact.id}|${lifeEventSummary}`,
    4,
  );
  const contactFollowUps = [
    "好，你先忙完手上的事，晚点再说。",
    "行，我先记着，不急着催你。",
    "知道了，有空的时候回我一声就好。",
    "好，那我先去处理自己的事，等你消息。",
  ];
  const characterFollowUps = [
    "嗯，我看到了，处理完手上的事就回你。",
    "知道了，我晚点把这件事说清楚。",
    "好，我先忙一会儿，等会儿再联系。",
    "收到，我记住了，忙完再跟你细说。",
  ];
  const next = [...drafts];
  if (!next.some((draft) => draft.sender === "contact")) {
    next.unshift({ sender: "contact", content: incoming || `我刚想起这件事，${contact.name}，你现在方便吗？` });
  }
  if (!next.some((draft) => draft.sender === "character")) {
    next.push({ sender: "character", content: outgoing || characterFollowUps[variant] });
  }
  let followUpIndex = 0;
  while (next.length < 4) {
    const sender = next.at(-1)?.sender === "contact" ? "character" : "contact";
    next.push({
      sender,
      content: sender === "contact"
        ? contactFollowUps[(variant + followUpIndex) % contactFollowUps.length]
        : characterFollowUps[(variant + followUpIndex) % characterFollowUps.length],
    });
    followUpIndex += 1;
  }
  return next.slice(0, 6);
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
  | "cooldown"
  | "incomplete_content"
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
  identities?: UserIdentity[];
  relationships?: CharacterRelationship[];
  messages?: Message[];
  moments?: Moment[];
  worldBookEntries?: WorldBookEntry[];
  relationshipNetworkNpcs?: RelationshipNetworkNpc[];
  relationshipNetworkMaps?: RelationshipNetworkMap[];
  musicTracks?: MusicTrack[];
  settings?: UserSettings;
  /** First unlock generation should establish a coherent trace in every supported app. */
  initial?: boolean;
  /** Repair missing NPC threads without regenerating other phone apps. */
  contactThreadRepair?: boolean;
  /** Restricts an explicit user-triggered refresh to these applications. */
  selectedApps?: readonly CharacterPhoneGeneratedAppId[];
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
  const isInitialGeneration = Boolean(input.initial);
  const isContactThreadRepair = Boolean(input.contactThreadRepair);
  const requestedApps = input.selectedApps
    ?? (isInitialGeneration ? CHARACTER_PHONE_GENERATABLE_APPS.map((app) => app.id) : undefined);
  const selectedApps = requestedApps ? new Set(requestedApps) : undefined;
  const isAppSelected = (appId: CharacterPhoneGeneratedAppId) => !selectedApps || selectedApps.has(appId);
  if (!isInitialGeneration && !isContactThreadRepair && requestedApps) {
    const coolingApps = getCharacterPhoneGenerationCooldowns(input.phone, requestedApps, now);
    if (coolingApps.length > 0) {
      return { phone: input.phone, status: "no_change", reason: "cooldown", createdCount: 0 };
    }
  }
  const chatSelected = isInitialGeneration || isAppSelected("chat");
  const selectedAppLabels = input.selectedApps?.map((appId) =>
    CHARACTER_PHONE_GENERATABLE_APPS.find((app) => app.id === appId)?.label || appId,
  );
  const allAppsSelected = Boolean(selectedApps
    && selectedApps.size === CHARACTER_PHONE_GENERATABLE_APPS.length
    && CHARACTER_PHONE_GENERATABLE_APPS.every((app) => selectedApps.has(app.id)));
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
        identities: input.identities,
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
    // A cleared/new phone deliberately suppresses source hydration, but the
    // owner still needs a visible direct-chat contact for first-life content.
    // Recreate only this synthetic owner contact here; evidence-backed NPC
    // contacts (for example relationship-network links) come from the scoped
    // context or the validated generation response.
    contacts: isInitialGeneration && !(contextualPhone.contacts ?? []).some((contact) => contact.source === "user" || contact.kind === "user")
      ? [createGeneratedUserContact(
          contextualPhone,
          input.activeIdentity,
          relationships.find((relation) =>
            resolveCanonicalCharacterId(relation.characterId, characters)
              === resolveCanonicalCharacterId(input.character.id, characters)
            && relation.userIdentityId === input.phone.ownerIdentityId),
        ), ...(contextualPhone.contacts ?? [])]
      : contextualPhone.contacts ?? [],
    threadMessages: contextualPhone.threadMessages ?? [],
    posts: contextualPhone.posts ?? [],
  };

  if (!isInitialGeneration && !isContactThreadRepair && selectedApps?.size === 0) {
    return { phone: base, status: "no_change", reason: "duplicate_content", createdCount: 0 };
  }

  // No API means no invented diary, schedule, search, contact, or chat. The
  // phone keeps real synchronized data instead of falling back to templates.
  if (!input.settings?.apiKey || !input.settings.selectedModel) {
    return { phone: base, status: "no_change", reason: "missing_api_config", createdCount: 0 };
  }

  const context = buildRecentContext({
    character: input.character,
    phone: base,
    characters,
    activeIdentity: input.activeIdentity,
    identities: input.identities,
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
    characters,
    activeIdentity: input.activeIdentity,
    identities: input.identities,
    relationships,
    messages,
    moments,
    worldBookEntries,
    relationshipNetworkContacts,
  });
  const allowedSources = new Map(lifeContext.sourceRefs.map((source) => [`${source.kind}:${source.id}`, source]));
  const repairTargets = isContactThreadRepair
    ? base.contacts.filter((contact) => !contact.removedAt
      && contact.source !== "user"
      && contact.kind !== "user"
      && !hasCompleteCharacterPhoneContactThread(base, contact.id)
      && getValidatedContactEvidenceRefs(contact, input, lifeContext, allowedSources).length > 0)
    : [];
  const repairSourceRefsByContactId = new Map(repairTargets.map((contact) => [
    contact.id,
    getValidatedContactEvidenceRefs(contact, input, lifeContext, allowedSources),
  ]));
  const textImageEvidence = collectTextImageEvidence(lifeContext);
  const roleName = roleDisplayName(input.character);
  const generationRequest = isContactThreadRepair
    ? "这是一次联系人聊天记录专项修复。只为下面列出的缺少聊天记录的已有联系人生成独立 contactThreads，每人至少一条联系人消息和一条角色回复。回复 contactId 必须逐字复制目标 ID，contactName 必须逐字复制目标名称。不得新增、删除或合并联系人；不得生成用户聊天、日记、日程、浏览器、相册、朋友圈、音乐、备忘录、待办、通话或其他应用记录。"
    : isInitialGeneration
    ? "这是该角色手机首次初始化。忽略前文可能出现的其他数量要求，以本条硬性合同为准。围绕同一个有证据的生活事件，批量生成完整但自然的手机生活。用户与角色的直接聊天只能镜像主聊天已有记录，禁止模拟用户发言；另外必须创建3—5位非用户NPC的独立联系人聊天，每位2—5条新消息，不把联系人混在线程。NPC可依据角色资料/世界书/关系网或最近事件合理推演（如求婚对应婚庆、酒店、钻石顾问），不得把用户、马甲或其他角色人设算作NPC。9个可生成应用都须各生成2—5条本次新增、非空、可见内容。未来日程安排在3—6天内；朋友圈至少一条设为 user/private；音乐须有曲目及收听记录。优先使用批量数组字段；同一事件可投影到多个应用，但内容必须彼此有差异且有上下文依据。"
    : selectedAppLabels
      ? allAppsSelected
        ? `这是用户选择“全部应用”的定向更新。为以下每一个可生成应用各追加2—5条有依据的新记录：${selectedAppLabels.join("、")}。不得遗漏所选应用；可依据最近事件合理推演但不得脱离上下文。选择聊天时可生成角色发给用户的新消息（userThreadMessages，sender只能是character），并为有依据的联系人生成contactThreads；绝不能伪造用户发言。`
        : `这是用户指定应用的定向更新，只生成以下应用的新内容：${selectedAppLabels.join("、")}。未选择的应用必须完全不生成数据；每个所选应用必须追加2—5条有依据的新记录。可依据最近事件合理推演但不得脱离上下文。选择聊天时可生成角色发给用户的新消息（userThreadMessages，sender只能是character），并为有依据的联系人生成contactThreads；绝不能伪造用户发言。`
      : "这是一次追加生活痕迹。请从最有依据的 2—4 个应用中随机选择少量记录，避免每次都选择相同应用或相同数量；不要为了填满首次初始化的数量而重复旧内容。";
  const generationContract = isContactThreadRepair
    ? ""
    : isInitialGeneration
      ? "不可覆盖的硬性数量合同：首次必须为3—5位非用户NPC建立独立聊天，每位NPC至少2条、最多5条新消息；用户、用户马甲、其他角色人设不能计入NPC。可结合最近聊天事件推演相关服务类NPC（如求婚/婚礼对应婚庆、酒店、钻石定制顾问），聊天必须围绕事件。全部9个可生成应用每个都写入2—5条本次新增、非空、可见记录；聊天按NPC会话数计算，其他应用按应用可见条目数计算。电话和相册也必须用数组提供2—5条。"
      : `不可覆盖的硬性数量合同：只处理本次选中的应用。每个选中应用必须追加2—5条本次新增、非空且可见的记录；聊天按新增消息条数计算，其他应用按新增条目数计算。若上下文不足，可从最近聊天事件合理推演相关记录和NPC；绝不能用空数据冒充成功。应用范围：${selectedAppLabels?.join("、") || "由本次请求指定"}。`;
  let response;
  try {
    response = await apiChat({
      message: `请根据下面这份“角色当前生活上下文”，先选定一个有证据的生活事件，再生成 2—4 条彼此呼应的手机痕迹。你是在模拟一个真实的人，而不是给应用填充示例数据。只返回 JSON，不要 Markdown：{"lifeEventSummary":"本次所有痕迹共同围绕的具体事件","lifeEventAtHoursAgo":2,"evidenceSourceIds":["chat:真实ID"],"contacts":[{"name":"有依据的联系人或群聊名称","relation":"与角色的关系","kind":"npc或group","memberNames":["有依据的群成员"],"isLongTerm":true}],"threadContactName":"本次联系人对话对应的联系人或群聊名称","threadIncoming":"联系人或群成员发给角色的一句话","threadOutgoing":"角色发给该联系人或群聊的一句话","callContactName":"有证据且已存在的通话联系人","callDirection":"incoming、outgoing或missed","callDurationSeconds":120,"searchQuery":"与该事件直接相关的搜索词","searchTitle":"搜索记录标题","searchResults":[{"platform":"平台名称","title":"该平台结果标题","snippet":"该平台对这次搜索的 AI 摘要"}],"searchReflection":"角色搜索后的一两句私下心声","diaryTitle":"角色关于该事件的私密日记标题","diaryBody":"角色关于该事件的私密想法","noteTitle":"与该事件相关的备忘录标题","noteContent":"备忘录内容","todoText":"该事件确实产生的待办","scheduleTitle":"该事件对应的具体日程标题","scheduleDetail":"具体日程详情","scheduleAtHours":5,"postContent":"角色可能就该事件发布的朋友圈内容","galleryTitle":"该事件中角色保存的相册标题","galleryCaption":"相册图片描述","hiddenGalleryTitle":"有明确私密证据时才填写的隐藏相册标题","hiddenGalleryCaption":"有明确私密证据时才填写的隐藏相册图片描述"}\n若有“主手机里可参考的文字图描述”，优先把它作为角色相册中的文字图素材；galleryCaption 只写画面描述，不要生成真实图片、data URL 或文件名。searchResults 仅在 searchQuery/searchTitle 有明确证据时填写 2—3 条不同平台的结果；平台名、标题和摘要都由你根据角色上下文生成，不要输出网址、外部链接或“查看原始页面”按钮。searchReflection 只在 searchQuery/searchTitle 有明确证据时填写：它是角色刚搜完后的私下反应，不是百科摘要或旁白。hiddenGalleryTitle/hiddenGalleryCaption 只有在证据明确包含私密、隐秘、秘密、仅自己可见等内容时才填写，否则必须为空。若没有足够依据生成某个字段，返回空字符串或空数组。`,
      // Keep the legacy response text above for backwards-compatible source
      // context, but send the current batch schema last so the model cannot
      // mistake the old singular example for the active quantity contract.
      ...{
        message: isContactThreadRepair
          ? `${generationRequest}\n只返回 JSON，不要 Markdown：{"lifeEventSummary":"与已有证据对应的简短事件","evidenceSourceIds":["只能从上下文给出的来源 ID 中选择"],"contactThreads":[{"contactId":"必须逐字匹配待修复联系人 ID","contactName":"必须逐字匹配待修复联系人","messages":[{"sender":"contact或character","content":"自然的聊天消息"}]}]}。仅输出待修复联系人对应的聊天，不得输出其他字段。待修复联系人：${repairTargets.map((contact) => `${contact.id}｜${contact.name}`).join("；")}`
          : `${generationRequest}\n只返回 JSON，不要 Markdown。使用批量字段：userThreadMessages:[{sender:"character",content:"角色新发给用户的消息"}]（只可含角色一方消息，禁止模拟用户发言）；contactThreads:[{contactName:"NPC或群聊",messages:[{sender:"contact或character",content:"消息内容"}]}]；browserEntries:[{query:"搜索词",title:"记录标题",results:[{platform:"平台",title:"结果标题",snippet:"摘要"}],searchResults:[{platform:"平台",title:"结果标题",snippet:"摘要"}],reflection:"搜索后的私下反应"}]；scheduleItems:[{title:"日程标题",detail:"具体事项",daysFromNow:3}]；diaryEntries:[{title:"日记标题",body:"私密想法"}]；noteEntries:[{title:"备忘录标题",content:"具体内容"}]；todoEntries:[{text:"待办事项"}]；posts:[{content:"朋友圈内容",visibility:"user、private 或 public"}]；musicTracks:[{title:"曲目",artist:"艺术家",duration:"3:30",current:true}]；musicListening:[{trackTitle:"曲目",playedHoursAgo:2,durationSeconds:180,playCount:2}]；musicNowPlaying:{trackTitle:"当前曲目"}。电话使用 callContactName/callDirection/callDurationSeconds，相册使用 galleryTitle/galleryCaption/hiddenGalleryTitle/hiddenGalleryCaption。始终保留 lifeEventSummary、evidenceSourceIds；contacts 仅在选择聊天应用时提供。未选择的应用数据一律返回空/省略。`,
      },
      history: [],
      systemInstruction: `你扮演真实存在的角色“${roleName}”，正在整理他自己的手机。\n${context}\n\n${generationRequest}\n${generationContract}\n严格规则：
1. 所有内容必须来自角色人设、世界书、最近上下文或已有手机记录的合理延伸；不能凭空制造与角色无关的人和事件。
2. 联系人只能是角色现实中可能认识的人：用户、已有角色关系、世界书/人设明确提到的家人朋友同事，或有明确依据的新 NPC。群聊必须有明确的群名称或成员依据。不要读取或生成用户不认识该角色的好友。name 只能填写真实的人名或群聊名，不能填写“我可”“我都开始怀疑你是不”这类句子片段；无法确定正式名称时请留空并不要添加该联系人。
3. userThreadMessages 只表示角色发给用户的直接消息；主聊天中的用户发言必须来自真实主聊天镜像，严禁模型代替用户发言。contactThreads/threadMessages 只表示 NPC 或群聊。${isContactThreadRepair ? "专项修复只可为指定待修复联系人写独立 contactThreads；这些联系人都已存在，不得返回或改动 contacts。" : "每个有证据的非用户联系人（尤其是关系网已连线 NPC）都必须对应 contacts 和自己的 contactThreads；每个 contactName 必须对应 contacts 或已有联系人；无法判断具体联系人就不要生成该线程。"}不要把 NPC 聊天塞进用户与角色的聊天镜像。
4. 内容要像真实手机记录：可以不完整、延迟、含蓄或不规律；${isContactThreadRepair ? "联系人聊天修复只生成指定联系人双方自然、简短的消息，不写入其他应用。" : isInitialGeneration ? "首次初始化覆盖所有可生成应用；用户直接聊天只镜像真实记录，NPC聊天独立生成。" : allAppsSelected ? `仅生成用户选择的应用（${selectedAppLabels?.join("、")}）。` : selectedAppLabels ? `本次严格限制在用户选择的应用（${selectedAppLabels.join("、")}）；未选择的应用不得填写。` : "后续生活推进从最有依据的2—4个应用生成，不要使用模板标题。"}
5. 角色真实姓名、备注名和人设文件名是不同概念。绝不能把文件名、输入字段名、世界书标题当作角色姓名或正文内容。
6. 日记必须是角色不会公开展示的私密想法；备忘录和日程必须是具体事项；浏览器输出搜索记录标题和 2—3 条不同平台的 AI 结果卡片，不能输出网址或引导查看原始页面；相册字段只描述角色真实可能保存的图片或文字图，不要凭空输出图片文件名。主手机的文字图只以描述形式参考，角色手机会在本地渲染文字图，不要声称有真实照片。
 7. lifeEventSummary 必须是本次唯一的生活事件；生成的应用字段必须是这个事件在不同应用中的自然痕迹，时间和人物不能互相矛盾。
8. searchReflection 必须是 1—3 句、约 15—90 字的第一人称私下反应：回答“为什么偏偏现在搜”“哪一点马上有用”“还有什么没想通或准备怎么做”。允许短句、停顿、犹豫、自我纠正和轻微情绪，必须贴合角色口吻与当下事件；不要复述搜索词，不要写成百科总结、心理分析、鸡汤或“我查这个是为了……”模板，也不要提到 AI、提示词或应用规则。若没有明确搜索动机就留空。
9. evidenceSourceIds 只能从“可引用的证据来源ID”原样选择；没有证据就返回空数组，不得编造 ID。
10. 隐藏相册字段只允许承载明确私密/隐秘证据，且生成的条目必须是 hidden=true 的私藏文字图；普通日常、公开动态和普通聊天图片不得放入隐藏相册。
11. ${isContactThreadRepair ? "联系人聊天修复只允许返回 evidenceSourceIds、lifeEventSummary 和 contactThreads；禁止填充或修改其他应用数据。" : isInitialGeneration ? "首次初始化必须优先使用批量数组字段满足数量下限，并让所有记录围绕同一事件；直接用户聊天只从真实主聊天同步；NPC和服务联系人可依最近事件合理推演。" : allAppsSelected ? `用户选择全部应用时，按上下文为每个选中应用追加内容，其他字段必须为空。` : selectedAppLabels ? `只允许生成这些应用：${selectedAppLabels.join("、")}；其他应用字段必须为空，不得通过兼容旧字段绕过范围限制。` : "每次随机选择 2—4 个最有依据的字段生成，其余全部留空；不要为了填满字段编造无依据内容。"}
12. 角色手机解锁密码和隐藏相册密码在手机创建时已经由系统按该角色资料先行设置并持久化；不要创建、修改、猜测或透露任何密码，也不要因为上下文中出现一串数字就回写密码字段。密码相关内容若确有证据，只能作为普通生活记录保留。
13. 不要生成解释、旁白、占位符、统一问候或应用说明；只返回 JSON。
14. 最终数量与结构以本条为准，覆盖前文任何相反的数量/留空要求：${isContactThreadRepair ? "仅输出指定联系人的2—5条独立聊天消息，不生成其他内容。" : isInitialGeneration ? "9个可生成应用必须每个新增2—5条可见内容；聊天必须有3—5位非用户NPC，每人2—5条消息；直接用户聊天不得伪造。" : `本次选中的每个应用必须新增2—5条可见内容；仅限：${selectedAppLabels?.join("、") || "本次请求应用"}。`} 统一使用批量字段：contactThreads:[{contactName,messages:[{sender,content}]}]；browserEntries:[{query,title,results,reflection}]；scheduleItems:[{title,detail,daysFromNow}]；diaryEntries:[{title,body}]；noteEntries:[{title,content}]；todoEntries:[{text}]；posts:[{content,visibility}]；musicTracks:[{title,artist,duration,current}] 和 musicListening:[{trackTitle,playedHoursAgo,durationSeconds,playCount}]；电话使用 phoneCalls:[{contactName,direction,durationSeconds}]；相册使用 galleryEntries:[{title,caption,hidden}]。批量字段优先，不要只返回旧版单条字段。成功与否由应用校验，若某项无法满足数量，就提供有上下文依据的不同记录，不要输出空内容。`,
      apiKey: input.settings.apiKey,
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
      apiTemperature: input.settings.apiTemperature,
      streamCompatible: input.settings.streamCompatible,
      purpose: "character_phone_generate",
      characterId: input.character.id,
      conversationId: input.phone.id,
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
  const requestedSourceIds = Array.isArray(raw.evidenceSourceIds)
    ? raw.evidenceSourceIds.filter((value): value is string => typeof value === "string")
    : [];
  const validatedSourceRefs = requestedSourceIds
    .map((id) => allowedSources.get(id))
    .filter((source): source is NonNullable<typeof source> => Boolean(source));
  // Regular generation requires provider citations. A contact repair can also
  // use the persisted contact's own validated source references; requiring one
  // global citation used to leave every missing NPC thread untouched when the
  // provider omitted or malformed evidenceSourceIds.
  if (validatedSourceRefs.length === 0 && !isContactThreadRepair) {
    return { phone: base, status: "no_change", reason: "missing_evidence", createdCount: 0 };
  }
  if (isContactThreadRepair) {
    const targets = repairTargets;
    if (targets.length === 0) {
      return {
        phone: base,
        status: "no_change",
        reason: contextualPhone !== input.phone ? "context_synced" : "duplicate_content",
        createdCount: 0,
      };
    }
    const requestedThreads = parseGeneratedContactThreads(raw.contactThreads, sourceFileName);
    const repairMessages: CharacterPhoneThreadMessage[] = [];
    const updatedContacts = base.contacts.map((contact) => {
      const target = targets.find((candidate) => candidate.id === contact.id);
      if (!target) return contact;
      const exactIdMatches = requestedThreads.filter((thread) => thread.contactId === target.id);
      const matchingThreads = requestedThreads.filter((thread) => contactKey(thread.contactName) === contactKey(target.name));
      const sameNameContacts = base.contacts.filter((candidate) => !candidate.removedAt
        && candidate.source !== "user"
        && candidate.kind !== "user"
        && contactKey(candidate.name) === contactKey(target.name));
      const requestedThread = exactIdMatches.length === 1
        ? exactIdMatches[0]
        : exactIdMatches.length === 0 && sameNameContacts.length === 1 && matchingThreads.length === 1
          ? matchingThreads[0]
          : undefined;
      const hasBothSenders = Boolean(requestedThread?.messages.some((message) => message.sender === "contact")
        && requestedThread?.messages.some((message) => message.sender === "character"));
      const existingMessages = base.threadMessages.filter((message) => message.contactId === target.id);
      const existingSenders = new Set(existingMessages.map((message) => message.sender));
      const requestedAdditions = hasBothSenders && existingMessages.length === 0
        ? requestedThread!.messages.slice(0, 6)
        : hasBothSenders
          ? requestedThread!.messages.filter((message) => !existingSenders.has(message.sender)).slice(0, 6)
          : [];
      const fallback = buildInitialContactFallback(
        target,
        validatedSourceRefs.length > 0 ? cleanGeneratedText(raw.lifeEventSummary, sourceFileName, 240) : "",
        input.character,
      );
      const drafts = requestedAdditions.length > 0
        ? requestedAdditions
        : fallback.filter((message) => !existingSenders.has(message.sender));
      const targetSourceRefs = repairSourceRefsByContactId.get(target.id) ?? [];
      const createdMessages = drafts.map((draft, index): CharacterPhoneThreadMessage => ({
        id: createId("phone-contact-thread-repair"),
        contactId: target.id,
        sender: draft.sender,
        content: draft.content,
        timestamp: now - (drafts.length - index) * 60 * 1000,
        sourceRefs: targetSourceRefs,
      }));
      repairMessages.push(...createdMessages);
      const latestMessage = createdMessages.at(-1);
      return latestMessage
        ? { ...contact, lastMessage: latestMessage.content, lastMessageAt: latestMessage.timestamp }
        : contact;
    });
    return {
      phone: {
        ...base,
        contacts: updatedContacts,
        threadMessages: [...base.threadMessages, ...repairMessages],
        lastGeneratedAt: repairMessages.length > 0 ? now : base.lastGeneratedAt,
        updatedAt: now,
      },
      status: repairMessages.length > 0 ? "generated" : "no_change",
      ...(repairMessages.length === 0 ? { reason: "duplicate_content" as const } : {}),
      createdCount: repairMessages.length,
    };
  }
  const contactEvidenceText = [
    input.character.personality,
    input.character.backstory,
    ...lifeContext.worldBookEntries.map((entry) => entry.content),
    ...lifeContext.recentMessages.map((message) => message.content),
    ...lifeContext.recentMoments.map((moment) => moment.content),
    ...base.contacts.flatMap((contact) => [contact.name, contact.remark, ...(contact.memberNames ?? [])]),
  ].filter(Boolean).join("\n");
  const recentScenarioEvidenceText = [
    ...lifeContext.recentMessages.map((message) => message.content),
    ...lifeContext.recentMoments.map((moment) => moment.content),
    ...lifeContext.worldBookEntries.map((entry) => entry.content),
  ].filter(Boolean).join("\n");
  const parsedContactDrafts = chatSelected
    ? parseContactDrafts(raw.contacts, input.character, sourceFileName, contactEvidenceText)
    : [];
  const scenarioContactDrafts = isInitialGeneration
    ? buildContextualScenarioContacts(recentScenarioEvidenceText)
    : [];
  const contactDrafts = [...parsedContactDrafts, ...scenarioContactDrafts];
  const mergedContacts = mergeGeneratedContacts(base, contactDrafts, validatedSourceRefs);
  const requestedThreadContact = cleanGeneratedText(raw.threadContactName, sourceFileName, 40);
  // An initial response with several contacts must not silently attach every
  // message to the first NPC. Only an explicitly named NPC thread may use
  // the legacy singular fields; otherwise they are treated as the direct
  // user conversation below.
  const threadContact = findThreadContact(mergedContacts.contacts, requestedThreadContact, mergedContacts.added);
  const incoming = cleanGeneratedText(raw.threadIncoming || raw.threadMessage, sourceFileName);
  const outgoing = cleanGeneratedText(raw.threadOutgoing || raw.message, sourceFileName);
  const lifeEventSummary = cleanGeneratedText(raw.lifeEventSummary, sourceFileName, 240);
  let threadDrafts = chatSelected ? parseGeneratedThreadMessages(raw.threadMessages, sourceFileName) : [];
  if (threadDrafts.length === 0) {
    if (incoming) threadDrafts.push({ sender: "contact", content: incoming });
    if (outgoing) threadDrafts.push({ sender: "character", content: outgoing });
  }
  if (isInitialGeneration && threadContact) {
    threadDrafts = completeInitialThreadDrafts(
      threadDrafts,
      incoming,
      outgoing,
      threadContact,
      input.character,
      lifeEventSummary,
    );
  }
  const ownerRelationIds = new Set(relationships
    .filter((relation) => relation.characterId === input.character.id && relation.userIdentityId === input.phone.ownerIdentityId)
    .map((relation) => relation.id));
  const userContact = mergedContacts.contacts.find((contact) =>
    !contact.removedAt
    && !contact.historyOnly
    && (contact.source === "user" || contact.kind === "user")
    && (contact.userIdentityId === input.phone.ownerIdentityId
      || (contact.relationId && ownerRelationIds.has(contact.relationId))));
  const rawUserThreadDrafts = chatSelected
    ? parseGeneratedThreadMessages(raw.userThreadMessages, sourceFileName)
    : [];
  // The phone's owner-side bubbles are a strict projection of real main-chat
  // messages. Only a newly generated character-authored message may be
  // promoted back to the main conversation; never synthesize an owner reply.
  let userThreadDrafts = isInitialGeneration
    ? []
    : rawUserThreadDrafts.filter((draft) => draft.sender === "character");
  if (!isInitialGeneration && chatSelected && userThreadDrafts.length === 0 && !threadContact && !requestedThreadContact && outgoing) {
    userThreadDrafts = [{ sender: "character", content: outgoing }];
  }
  let contactThreadDrafts = chatSelected
    ? parseGeneratedContactThreads(raw.contactThreads, sourceFileName)
    : [];
  if (isInitialGeneration && threadContact && threadDrafts.length > 0) {
    contactThreadDrafts = [
      ...contactThreadDrafts,
      { contactId: threadContact.id, contactName: threadContact.name, messages: threadDrafts },
    ];
  }
  const explicitContactThreadIds = new Set(contactThreadDrafts.flatMap((thread) => {
    const matches = mergedContacts.contacts.filter((contact) => !contact.removedAt
      && contact.source !== "user"
      && contact.kind !== "user"
      && contactKey(contact.name) === contactKey(thread.contactName));
    return matches.length === 1 ? [matches[0].id] : [];
  }));
  if (threadContact && threadDrafts.length > 0) explicitContactThreadIds.add(threadContact.id);
  // Providers can return contacts without their separate NPC threads, and an
  // older phone can already contain evidence-backed contacts whose first-life
  // generation did not create a thread. Backfill only contacts with source
  // evidence, and only after this response itself passes evidence validation.
  // Existing threads make the operation idempotent across retries/reloads.
  if (chatSelected && validatedSourceRefs.length > 0) {
    const existingThreadContactIds = new Set(base.threadMessages.map((message) => message.contactId));
    mergedContacts.contacts
      .filter((contact) => !contact.removedAt
        && contact.source !== "user"
        && contact.kind !== "user"
        && (!isInitialGeneration || isInitialNpcConversationContact(contact))
        && Boolean(contact.sourceRefs?.length || contact.linkedCharacterId || contact.relationshipNetworkNpcId)
        && !explicitContactThreadIds.has(contact.id)
        && !existingThreadContactIds.has(contact.id))
      .forEach((contact) => {
        // These contacts already came from relationship-network, character,
        // world-book, or validated provider evidence. The fallback is only a
        // two-sided local trace for that evidence; it never creates a new
        // contact and runs only after the provider cites valid scoped evidence.
        contactThreadDrafts.push({
          contactName: contact.name,
          contactId: contact.id,
          messages: buildInitialContactFallback(contact, lifeEventSummary, input.character),
        });
      });
  }
  if (isInitialGeneration) {
    const explicitByContactId = new Map<string, GeneratedContactThreadDraft>();
    contactThreadDrafts.forEach((thread) => {
      const matches = mergedContacts.contacts.filter((contact) => isInitialNpcConversationContact(contact)
        && (thread.contactId ? contact.id === thread.contactId : contactKey(contact.name) === contactKey(thread.contactName)));
      if (matches.length === 1) explicitByContactId.set(matches[0].id, thread);
    });
    const npcCandidates = mergedContacts.contacts
      .filter((contact) => isInitialNpcConversationContact(contact)
        && getValidatedContactEvidenceRefs(contact, input, lifeContext, allowedSources).length > 0)
      .sort((left, right) => {
        const priority = (contact: CharacterPhoneContact) => Number(explicitByContactId.has(contact.id)) * 4
          + Number(Boolean(contact.relationshipNetworkNpcId)) * 2
          + Number(mergedContacts.added.some((added) => added.id === contact.id));
        return priority(right) - priority(left) || left.name.localeCompare(right.name);
      });
    contactThreadDrafts = npcCandidates.slice(0, 5).map((contact) => {
      const requestedThread = explicitByContactId.get(contact.id);
      const draftMessages = requestedThread?.messages?.slice(0, 5) ?? [];
      const completedMessages = draftMessages.length > 0
        ? completeInitialThreadDrafts(
            draftMessages,
            draftMessages.find((message) => message.sender === "contact")?.content || "",
            draftMessages.find((message) => message.sender === "character")?.content || "",
            contact,
            input.character,
            lifeEventSummary,
          ).slice(0, 5)
        : buildInitialContactFallback(contact, lifeEventSummary, input.character);
      return { contactId: contact.id, contactName: contact.name, messages: completedMessages };
    });
  }
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
    musicTracks: [...(base.musicTracks ?? [])],
    listeningHistory: [...(base.listeningHistory ?? [])],
    musicPlaylists: [...(base.musicPlaylists ?? [])],
    lifeEvents: [...(base.lifeEvents ?? [])],
  };
  const lifeEventId = createId("phone-life-event");
  const artifactRefs: CharacterPhoneLifeEvent["artifactRefs"] = [];
  const artifactApps = new Set<CharacterPhoneLifeEvent["artifactRefs"][number]["app"]>();
  const artifactCounts = new Map<CharacterPhoneLifeEvent["artifactRefs"][number]["app"], number>();
  const pushArtifact = <T extends { id: string; lifeEventId?: string }>(
    app: CharacterPhoneLifeEvent["artifactRefs"][number]["app"],
    items: T[],
    item: T,
    signature: (value: T) => string,
  ) => {
    if (!isAppSelected(app as CharacterPhoneGeneratedAppId)) return false;
    if (items.some((existing) => signature(existing) === signature(item))) return false;
    const maxAppCount = isInitialGeneration ? 10 : selectedApps?.size ?? 4;
    if (!artifactApps.has(app) && artifactApps.size >= maxAppCount) return false;
    // Follow-up generations stay intentionally small even when a provider
    // returns an unexpectedly large array. First initialization is the one
    // place where the requested multi-record baseline is allowed.
    const maxArtifactCount = isInitialGeneration && app === "chat" ? Number.MAX_SAFE_INTEGER : 5;
    if ((artifactCounts.get(app) ?? 0) >= maxArtifactCount) return false;
    item.lifeEventId = lifeEventId;
    items.push(item);
    artifactApps.add(app);
    artifactCounts.set(app, (artifactCounts.get(app) ?? 0) + 1);
    artifactRefs.push({ app, id: item.id });
    return true;
  };

  if (!isInitialGeneration && userContact && userThreadDrafts.length > 0) {
    userThreadDrafts.slice(0, 6).forEach((draft, index) => {
      const message: CharacterPhoneThreadMessage = {
        id: createId(`phone-life-user-thread-${draft.sender}`),
        contactId: userContact.id,
        sender: draft.sender,
        content: draft.content,
        timestamp: now - (userThreadDrafts.length - index) * 60 * 1000,
      };
      pushArtifact("chat", next.threadMessages, message, (value) => `${value.contactId}|${value.sender}|${normalizeArtifactText(value.content)}`);
    });
  }

  if (!isInitialGeneration && chatSelected && threadContact && threadDrafts.length > 0) {
    threadDrafts.forEach((draft, index) => {
      const message: CharacterPhoneThreadMessage = {
        id: createId(`phone-life-thread-${draft.sender}`),
        contactId: threadContact.id,
        sender: draft.sender,
        content: draft.content,
        timestamp: now - (threadDrafts.length - index) * 60 * 1000,
      };
      pushArtifact("chat", next.threadMessages, message, (value) => `${value.contactId}|${value.sender}|${normalizeArtifactText(value.content)}`);
    });
  }

  contactThreadDrafts.forEach((thread) => {
    const matchingContacts = mergedContacts.contacts.filter((candidate) => !candidate.removedAt
      && candidate.source !== "user"
      && candidate.kind !== "user"
      && (!isInitialGeneration || isInitialNpcConversationContact(candidate))
      && (thread.contactId
        ? candidate.id === thread.contactId
        : contactKey(candidate.name) === contactKey(thread.contactName)));
    // Provider thread drafts currently identify recipients by display name.
    // If multiple distinct contacts share that name, never attach history to
    // an arbitrary identity.
    const contact = matchingContacts.length === 1 ? matchingContacts[0] : undefined;
    if (!contact) return;
    const threadMessages = isInitialGeneration ? thread.messages.slice(0, 5) : thread.messages;
    threadMessages.forEach((draft, index) => {
      const message: CharacterPhoneThreadMessage = {
        id: createId(`phone-life-contact-thread-${draft.sender}`),
        contactId: contact.id,
        sender: draft.sender,
        content: draft.content,
        timestamp: now - (threadMessages.length - index) * 60 * 1000,
      };
      pushArtifact("chat", next.threadMessages, message, (value) => `${value.contactId}|${value.sender}|${normalizeArtifactText(value.content)}`);
    });
  });

  const callContactName = cleanGeneratedText(raw.callContactName, sourceFileName, 40);
  const callDirection = raw.callDirection === "incoming" || raw.callDirection === "outgoing" || raw.callDirection === "missed"
    ? raw.callDirection
    : undefined;
  const callDrafts = parseGeneratedPhoneCalls(raw.phoneCalls, sourceFileName);
  if (callDrafts.length === 0 && callContactName && callDirection) {
    const durationSeconds = finiteNumber(raw.callDurationSeconds);
    callDrafts.push({ contactName: callContactName, direction: callDirection, ...(durationSeconds !== undefined ? { durationSeconds } : {}) });
  }
  callDrafts.forEach((draft, index) => {
    const matchingContacts = mergedContacts.contacts.filter((contact) => !contact.removedAt
      && contactKey(contact.name) === contactKey(draft.contactName));
    const callContact = matchingContacts.length === 1 ? matchingContacts[0] : undefined;
    if (!callContact) return;
    const durationSeconds = draft.durationSeconds;
    const call: CharacterPhoneCallRecord = {
      id: createId("phone-life-call"),
      contactId: callContact.id,
      contactName: callContact.remark || callContact.name,
      direction: draft.direction,
      timestamp: now - (3 + index * 11) * 60 * 1000,
      ...(draft.direction !== "missed" && durationSeconds !== undefined ? { durationSeconds: Math.max(0, Math.min(24 * 60 * 60, Math.round(durationSeconds))) } : {}),
    };
    pushArtifact("phone", next.phoneCalls ?? (next.phoneCalls = []), call, (value) => `${value.contactId}|${value.direction}|${value.timestamp}`);
  });

  const searchQuery = cleanGeneratedText(raw.searchQuery, sourceFileName, 180);
  const searchTitle = cleanGeneratedText(raw.searchTitle, sourceFileName, 180) || deriveGeneratedTitle(searchQuery, sourceFileName);
  const browserDrafts = parseGeneratedBrowserEntries(raw.browserEntries, sourceFileName);
  if (browserDrafts.length === 0 && (searchQuery || searchTitle)) {
    browserDrafts.push({
      query: searchQuery || searchTitle,
      title: searchTitle || searchQuery,
      results: parseGeneratedBrowserResults(raw.searchResults, sourceFileName),
      reflection: cleanGeneratedText(raw.searchReflection ?? raw.reflection, sourceFileName, 240),
    });
  }
  browserDrafts.forEach((draft, index) => {
    const entryBase = {
      id: createId("phone-life-search"),
      query: draft.query,
      title: draft.title,
      timestamp: now - (8 + (browserDrafts.length - index) * 7) * 60 * 1000,
      ...(draft.results.length >= 2 ? { results: draft.results } : {}),
      ...(draft.reflection ? { reflection: draft.reflection } : {}),
    };
    const browserDetail = buildCharacterPhoneBrowserDetail(
      entryBase,
      roleName,
      `${input.character.personality || ""}\n${input.character.backstory || ""}`,
    );
    const entry = {
      ...entryBase,
      // Keep the existing browser-entry storage shape. `error` is a
      // display-time detail and must not become a persisted schema field.
      summary: browserDetail.summary,
      reflection: browserDetail.reflection,
      results: browserDetail.results,
      sourceUrl: browserDetail.sourceUrl,
      sourceLabel: browserDetail.sourceLabel,
    };
    pushArtifact("browser", next.browserHistory, entry, (value) => `${normalizeArtifactText(value.query)}|${normalizeArtifactText(value.title)}`);
  });
  const diaryBody = cleanGeneratedText(raw.diaryBody, sourceFileName);
  const diaryTitle = cleanGeneratedText(raw.diaryTitle, sourceFileName, 160) || deriveGeneratedTitle(diaryBody, sourceFileName);
  const diaryDrafts = parseGeneratedDiaryEntries(raw.diaryEntries, sourceFileName);
  if (diaryDrafts.length === 0 && (diaryTitle || diaryBody)) {
    diaryDrafts.push({ title: diaryTitle || diaryBody.slice(0, 24), body: diaryBody, hidden: false });
  }
  diaryDrafts.forEach((draft, index) => {
    const entry: CharacterPhoneDiaryEntry = { id: createId("phone-life-diary"), title: draft.title, body: draft.body, timestamp: now - (12 + (diaryDrafts.length - index) * 11) * 60 * 1000, ...(draft.hidden ? { hidden: true } : {}) };
    pushArtifact("diary", next.diaryEntries, entry, (value) => `${normalizeArtifactText(value.title)}|${normalizeArtifactText(value.body)}`);
  });
  const noteContent = cleanGeneratedText(raw.noteContent, sourceFileName);
  const noteTitle = cleanGeneratedText(raw.noteTitle, sourceFileName, 160) || deriveGeneratedTitle(noteContent, sourceFileName);
  const noteDrafts = parseGeneratedNoteEntries(raw.noteEntries, sourceFileName);
  if (noteDrafts.length === 0 && (noteTitle || noteContent)) {
    noteDrafts.push({ title: noteTitle || noteContent.slice(0, 24), content: noteContent });
  }
  noteDrafts.forEach((draft, index) => {
    const entry: CharacterPhoneNote = { id: createId("phone-life-note"), title: draft.title, content: draft.content, timestamp: now - (10 + (noteDrafts.length - index) * 9) * 60 * 1000 };
    pushArtifact("notes", next.notes ?? (next.notes = []), entry, (value) => `${normalizeArtifactText(value.title)}|${normalizeArtifactText(value.content)}`);
  });
  const todoText = cleanGeneratedText(raw.todoText, sourceFileName, 180);
  const todoDrafts = parseGeneratedTodoEntries(raw.todoEntries, sourceFileName);
  if (todoDrafts.length === 0 && todoText) todoDrafts.push({ text: todoText });
  todoDrafts.forEach((draft) => {
    const entry: CharacterPhoneTodo = { id: createId("phone-life-todo"), text: draft.text, checked: false, source: "generated", ...(draft.dueAt !== undefined ? { dueAt: draft.dueAt } : {}) };
    pushArtifact("notes", next.todos ?? (next.todos = []), entry, (value) => normalizeArtifactText(value.text));
  });
  const scheduleDetail = cleanGeneratedText(raw.scheduleDetail, sourceFileName);
  const scheduleTitle = cleanGeneratedText(raw.scheduleTitle, sourceFileName, 160) || deriveGeneratedTitle(scheduleDetail, sourceFileName);
  const scheduleDrafts = parseGeneratedScheduleItems(raw.scheduleItems, sourceFileName);
  if (scheduleDrafts.length === 0 && (scheduleTitle || scheduleDetail)) {
    const hours = finiteNumber(raw.scheduleAtHours);
    scheduleDrafts.push({ title: scheduleTitle || scheduleDetail.slice(0, 24), detail: scheduleDetail, ...(hours !== undefined ? { hoursFromNow: hours } : {}) });
  }
  scheduleDrafts.forEach((draft, index) => {
    const hours = draft.daysFromNow !== undefined
      ? Math.max(isInitialGeneration ? 3 : 1, Math.min(6, draft.daysFromNow)) * 24
      : Math.max(isInitialGeneration ? 72 : 1, Math.min(144, draft.hoursFromNow ?? 5 + index * 24));
    const entry: CharacterPhoneScheduleItem = { id: createId("phone-life-schedule"), title: draft.title, detail: draft.detail, timestamp: now + hours * 60 * 60 * 1000 };
    pushArtifact("schedule", next.scheduleItems, entry, (value) => `${value.title}|${value.detail}|${value.timestamp}`);
  });
  const requestedGalleryCaption = cleanGeneratedText(raw.galleryCaption, sourceFileName);
  const requestedGalleryTitle = cleanGeneratedText(raw.galleryTitle, sourceFileName, 160);
  const galleryDrafts = parseGeneratedGalleryEntries(raw.galleryEntries, sourceFileName);
  const referencedTextImage = !requestedGalleryCaption && !requestedGalleryTitle
    ? textImageEvidence
      .slice()
      .reverse()
      .find((item) => validatedSourceRefs.some((source) => source.kind === item.sourceKind && source.id === item.sourceId))
    : undefined;
  // First-life initialization should leave a visible album trace even when a
  // provider omits the optional gallery fields. Use the already validated
  // event summary as a local text-image caption; follow-up generations remain
  // evidence-driven and do not invent album items.
  const galleryCaption = requestedGalleryCaption
    || referencedTextImage?.description
    || (isInitialGeneration ? lifeEventSummary : "");
  const galleryTitle = requestedGalleryTitle
    || deriveGeneratedTitle(galleryCaption, sourceFileName)
    || (referencedTextImage ? referencedTextImage.label : "")
    || (isInitialGeneration && galleryCaption ? `${roleName}的生活记录` : "");
  if (galleryDrafts.length === 0 && (galleryTitle || galleryCaption)) {
    galleryDrafts.push({ title: galleryTitle || galleryCaption.slice(0, 24), caption: galleryCaption || galleryTitle, hidden: false });
  }
  galleryDrafts.forEach((draft, index) => {
    if (draft.hidden && !isPrivateGalleryEvidence(`${draft.title} ${draft.caption}`)) return;
    const textImageTitle = normalizeGalleryTextImageTitle(draft.title || draft.caption.slice(0, 24));
    const entry: CharacterPhoneGalleryItem = {
      id: createId("phone-life-gallery"),
      title: textImageTitle,
      caption: draft.caption || draft.title,
      timestamp: now - (25 + index * 7) * 60 * 1000,
      ...(draft.hidden ? { hidden: true } : {}),
      source: "generated",
      textImageForId: `phone-life-gallery-${lifeEventId}`,
      dataUrl: createCharacterPhoneTextImageDataUrl(draft.caption || draft.title, draft.title),
      ...(referencedTextImage ? { sourceId: referencedTextImage.sourceId } : {}),
    };
    pushArtifact("gallery", next.galleryItems, entry, (value) => `${normalizeArtifactText(value.title)}|${normalizeArtifactText(value.caption)}`);
  });
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
  const postDrafts = parseGeneratedPosts(raw.posts, sourceFileName);
  if (postDrafts.length === 0 && postContent) {
    // Preserve the old singular response shape while making the first
    // generated trace visible to the user (or private) instead of silently
    // creating a public post.
    postDrafts.push({ content: postContent, visibility: isInitialGeneration ? "user" : "public" });
  }
  if (isInitialGeneration && postDrafts.length > 0 && !postDrafts.some((draft) => draft.visibility === "user" || draft.visibility === "private")) {
    postDrafts[0] = { ...postDrafts[0], visibility: "private" };
  }
  postDrafts.forEach((draft, index) => {
    const entry: CharacterPhonePost = { id: createId("phone-life-post"), author: roleName, authorId: input.character.id, authorAvatar: input.character.avatar, content: draft.content, timestamp: now - (2 + (postDrafts.length - index) * 13) * 60 * 1000, likes: 0, comments: [], source: "generated", visibility: draft.visibility, ...(draft.visibilityTargetIds ? { visibilityTargetIds: draft.visibilityTargetIds } : {}) };
    pushArtifact("moments", next.posts, entry, (value) => normalizeArtifactText(value.content));
  });

  if (isAppSelected("music")) {
    const musicDrafts = parseGeneratedMusicTracks(raw.musicTracks, sourceFileName);
    const musicByTitle = new Map(next.musicTracks.map((track) => [normalizeArtifactText(track.title), track]));
    musicDrafts.forEach((draft) => {
      const key = normalizeArtifactText(draft.title);
      if (musicByTitle.has(key)) return;
      const track: CharacterPhoneMusicTrack = {
        id: createId("phone-life-music"),
        title: draft.title,
        artist: draft.artist,
        duration: draft.duration,
      };
      if (pushArtifact("music", next.musicTracks, track, (value) => `${normalizeArtifactText(value.title)}|${normalizeArtifactText(value.artist)}`)) {
        musicByTitle.set(key, track);
      }
    });
    // A first-life phone should never have a completely empty music surface.
    // When no local library and no provider track are available, create one
    // clearly role-scoped listening trace rather than falling back to a shared
    // demo song or another role's library.
    if (isInitialGeneration && next.musicTracks.length === 0) {
      const track: CharacterPhoneMusicTrack = {
        id: createId("phone-life-music"),
        title: `${roleName}的常听片段`,
        artist: roleName,
        duration: "3:30",
      };
      if (pushArtifact("music", next.musicTracks, track, (value) => `${normalizeArtifactText(value.title)}|${normalizeArtifactText(value.artist)}`)) {
        musicByTitle.set(normalizeArtifactText(track.title), track);
      }
    }
    const listeningDrafts = parseGeneratedMusicListening(raw.musicListening);
    const defaultListeningDrafts = isInitialGeneration && listeningDrafts.length === 0
      ? next.musicTracks.slice(0, 4).map((track, index) => ({ trackTitle: track.title, playedHoursAgo: 2 + index * 5, durationSeconds: 180 + index * 30, playCount: 1 + index }))
      : listeningDrafts;
    const listeningHistory = next.listeningHistory;
    defaultListeningDrafts.forEach((draft, index) => {
      const track = draft.trackTitle
        ? musicByTitle.get(normalizeArtifactText(draft.trackTitle))
        : next.musicTracks[Math.max(0, Math.min(next.musicTracks.length - 1, Math.round(draft.trackIndex ?? index)))];
      if (!track) return;
      const playedHoursAgo = Math.max(0, Math.min(24 * 30, draft.playedHoursAgo ?? (2 + index * 4)));
      const durationSeconds = Math.max(30, Math.min(4 * 60 * 60, Math.round(draft.durationSeconds ?? 210)));
      const duplicate = listeningHistory.some((record) => record.trackId === track.id && Math.abs(record.startedAt - (now - playedHoursAgo * 60 * 60 * 1000)) < 60 * 1000);
      if (duplicate) return;
      const record: CharacterPhoneListeningRecord = {
        id: createId("phone-life-listening"),
        trackId: track.id,
        startedAt: now - playedHoursAgo * 60 * 60 * 1000,
        durationSeconds,
        source: "generated",
      };
      pushArtifact("music", listeningHistory, record, (value) => `${value.trackId}|${value.startedAt}|${value.durationSeconds}`);
    });
    if (isInitialGeneration && next.musicTracks.length > 0 && listeningHistory.length > 0) {
      const nowPlayingRecord = raw.musicNowPlaying && typeof raw.musicNowPlaying === "object" && !Array.isArray(raw.musicNowPlaying)
        ? raw.musicNowPlaying as Record<string, unknown>
        : undefined;
      const nowPlayingTitle = cleanGeneratedText(nowPlayingRecord?.trackTitle ?? nowPlayingRecord?.title, sourceFileName, 120);
      const nowPlayingIndex = finiteNumber(nowPlayingRecord?.trackIndex);
      const current = next.musicTracks.find((track) => musicDrafts.find((draft) => draft.current && normalizeArtifactText(draft.title) === normalizeArtifactText(track.title)))
        || (nowPlayingTitle ? next.musicTracks.find((track) => normalizeArtifactText(track.title) === normalizeArtifactText(nowPlayingTitle)) : undefined)
        || (nowPlayingIndex !== undefined ? next.musicTracks[Math.max(0, Math.min(next.musicTracks.length - 1, Math.round(nowPlayingIndex)))] : undefined)
        || next.musicTracks[0];
      next.currentlyPlayingTrackId = current.id;
      next.currentlyPlayingSince = now - 18 * 60 * 1000;
      next.frequentListeningHours = [...new Set(listeningHistory.map((record) => new Date(record.startedAt).getHours()))].sort((left, right) => left - right).slice(0, 6);
      next.musicPlaylists = [{
        id: createId("phone-life-playlist"),
        name: "最近常听",
        trackIds: next.musicTracks.slice(0, 8).map((track) => track.id),
        source: "generated",
      }, ...next.musicPlaylists.filter((playlist) => playlist.name !== "最近常听")];
    }
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

  const allGeneratedAppIds = CHARACTER_PHONE_GENERATABLE_APPS.map((app) => app.id);
  const appsToValidate = isContactThreadRepair ? [] : requestedApps ?? [...artifactApps].filter(
    (app): app is CharacterPhoneGeneratedAppId => allGeneratedAppIds.includes(app as CharacterPhoneGeneratedAppId),
  );
  const completedInitialNpcThreadIds = isInitialGeneration
    ? mergedContacts.contacts
      .filter(isInitialNpcConversationContact)
      .filter((contact) => {
        const thread = next.threadMessages.filter((message) => message.contactId === contact.id && message.lifeEventId === lifeEventId);
        return thread.some((message) => message.sender === "contact")
          && thread.some((message) => message.sender === "character");
      })
      .map((contact) => contact.id)
    : [];
  const incompleteApps = appsToValidate.filter((app) => {
    if (isInitialGeneration && app === "chat") {
      return completedInitialNpcThreadIds.length < 3 || completedInitialNpcThreadIds.length > 5;
    }
    const count = artifactCounts.get(app) ?? 0;
    return count < 2 || count > 5;
  });
  if (incompleteApps.length > 0 || artifactRefs.length === 0) {
    return {
      phone: base,
      status: "no_change",
      reason: "incomplete_content",
      createdCount: 0,
    };
  }

  if (artifactRefs.length > 0) {
    const successfulPhoneBase = {
      ...next,
      ...(!isContactThreadRepair ? { lastGeneratedAt: now } : {}),
      ...(isInitialGeneration ? { initialContentGeneratedAt: now } : {}),
      ...(isInitialGeneration ? { initialContentPending: false } : {}),
      ...(isInitialGeneration ? { sourceHydrationSuppressedAt: undefined } : {}),
      updatedAt: now,
    };
    const successfulPhone = isContactThreadRepair
      ? successfulPhoneBase
      : recordCharacterPhoneGenerationCooldowns(successfulPhoneBase, appsToValidate, now);
    return {
      phone: successfulPhone,
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
