import type {
  Character,
  ForumReply,
  ForumThread,
  MemoryItem,
  Message,
  UserIdentity,
  WorldBookEntry,
} from "../../types";

export interface ForumGeneratedTextValidation {
  valid: boolean;
  text: string;
  changed: boolean;
  reason?: "empty" | "roleplay" | "pseudo-media" | "incomplete";
}

const ROLEPLAY_CUES = [
  "抬眼", "垂眼", "看了看屏幕", "盯着屏幕", "沉默了一会", "沉默片刻",
  "指尖", "敲了敲手机", "敲了一下", "皱了皱眉", "皱眉", "挑眉", "低头",
  "抿唇", "勾唇", "笑了笑", "叹了口气", "愣了一下", "脸红", "害羞",
  "心想", "心里想", "内心", "屏幕上的留言", "手机边缘",
  "发了一个表情包", "发送了一条语音", "发了一张图片", "发了一张照片",
].join("|");

const roleplayParentheticalPatterns = [
  new RegExp(`（(?=[^）\\n]{0,120}(?:${ROLEPLAY_CUES}))[^）\\n]{1,160}）`, "gu"),
  new RegExp(`\\((?=[^)\\n]{0,120}(?:${ROLEPLAY_CUES}))[^)\\n]{1,160}\\)`, "gu"),
];

const stateOrMediaTagPattern =
  /[\[【](?:无语|沉默|害羞|震惊|开心|难过|愤怒|发送表情包|表情包|图片|照片|视频|语音(?:\s*\d+\s*秒)?|音频|附件|sticker(?:\|[^\]】]*)?)[\]】]/giu;
const internalMarkerPattern =
  /[\[【](?:发送于\s*[:：][^\]】]+|等待\s*\d+\s*秒|消息时间\s*[:：][^\]】]+)[\]】]/giu;
const markdownImagePattern = /!\[[^\]]*\]\([^)\n]*\)/gu;
const mediaElementPattern = /<\/?(?:audio|video|img|source)\b[^>]*>/giu;
const dataUrlPattern = /data:(?:image|audio|video)\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/giu;
const unwrappedFakeMediaPattern =
  /(?:^|[。！？!?\n])\s*(?:我)?(?:发送|发出|发了|发来|上传)(?:了)?一(?:张|个|条)(?:图片|照片|表情包|语音|视频)(?:[。！？!?\s]|$)/u;

const patternMatches = (pattern: RegExp, value: string): boolean => {
  pattern.lastIndex = 0;
  const matched = pattern.test(value);
  pattern.lastIndex = 0;
  return matched;
};

const normalizeWhitespace = (value: string): string =>
  value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const looksIncompleteAfterRemoval = (value: string): boolean =>
  /^[，。！？、；：,.!?;:\s]+$/u.test(value)
  || /(?:但是|不过|因为|所以|然后|而且|只是|就是|我|你|他|她|它)\s*$/u.test(value);

export const sanitizeForumGeneratedText = (
  value: string,
): ForumGeneratedTextValidation => {
  const original = String(value || "").trim();
  let text = original;
  let removedRoleplay = false;
  for (const pattern of roleplayParentheticalPatterns) {
    const next = text.replace(pattern, () => {
      removedRoleplay = true;
      return "";
    });
    text = next;
  }
  text = text
    .replace(markdownImagePattern, "")
    .replace(stateOrMediaTagPattern, "")
    .replace(internalMarkerPattern, "")
    .replace(mediaElementPattern, "")
    .replace(dataUrlPattern, "");
  text = normalizeWhitespace(text);
  const changed = text !== original;
  if (!text) {
    return { valid: false, text: "", changed, reason: "empty" };
  }
  if (patternMatches(unwrappedFakeMediaPattern, text)
    || patternMatches(stateOrMediaTagPattern, text)
    || patternMatches(markdownImagePattern, text)
    || patternMatches(mediaElementPattern, text)
    || patternMatches(dataUrlPattern, text)) {
    return { valid: false, text, changed, reason: "pseudo-media" };
  }
  if (roleplayParentheticalPatterns.some((pattern) => patternMatches(pattern, text))) {
    return { valid: false, text, changed, reason: "roleplay" };
  }
  if (removedRoleplay && looksIncompleteAfterRemoval(text)) {
    return { valid: false, text, changed, reason: "incomplete" };
  }
  return { valid: true, text, changed };
};

export const validateForumGeneratedText = (
  value: string,
): ForumGeneratedTextValidation => sanitizeForumGeneratedText(value);

const compactName = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, "").trim();

export const buildForumProtectedNames = (input: {
  ownerIdentity?: UserIdentity;
  characters?: readonly Character[];
  structuredAliases?: readonly string[];
}): string[] => {
  const names = new Set<string>();
  const add = (value?: string) => {
    const normalized = value ? compactName(value) : "";
    if (normalized.length >= 2 && normalized !== "匿名用户") names.add(normalized);
  };
  add(input.ownerIdentity?.name);
  input.characters?.forEach((character) => {
    if (character.isGroupChat || character.isContactInstance) return;
    add(character.name);
    add(character.remark);
  });
  input.structuredAliases?.forEach(add);
  return [...names].sort((left, right) => right.length - left.length);
};

export const findForumPrivateNameViolation = (input: {
  text: string;
  protectedNames: readonly string[];
  publicTexts?: readonly string[];
  allowedAuthorNames?: readonly string[];
}): string | undefined => {
  const text = compactName(input.text);
  const publicText = compactName((input.publicTexts || []).join("\n"));
  const allowed = new Set((input.allowedAuthorNames || []).map(compactName));
  return input.protectedNames.find((name) => {
    const normalized = compactName(name);
    return text.includes(normalized)
      && !publicText.includes(normalized)
      && !allowed.has(normalized);
  });
};

const TOPIC_CATEGORIES: ReadonlyArray<[string, RegExp]> = [
  ["家居维修", /水管|漏水|下水道|堵塞|维修|家电|装修|物业/u],
  ["工作", /工作|同事|上班|加班|项目|会议|职场/u],
  ["学习", /学习|考试|作业|课程|学校|论文|复习/u],
  ["音乐", /音乐|歌曲|歌手|专辑|歌词|听歌/u],
  ["影视", /电影|电视剧|综艺|动漫|演员|剧情/u],
  ["阅读", /读书|小说|书籍|作者|阅读/u],
  ["游戏", /游戏|玩家|副本|排位|主机/u],
  ["运动", /运动|训练|跑步|健身|球赛|瑜伽/u],
  ["饮食", /吃饭|食堂|餐厅|做饭|菜谱|咖啡|奶茶/u],
  ["旅行", /旅行|出差|酒店|景点|车站|机场/u],
  ["宠物", /宠物|猫|狗|萨摩耶|养宠/u],
  ["健康", /身体|生病|医院|睡眠|失眠|药物/u],
  ["数码技术", /手机|电脑|软件|代码|网络|数码|相机/u],
  ["天气", /天气|下雨|下雪|刮风|温度/u],
  ["日常生活", /生活|家里|邻居|朋友|家人|日常/u],
] as const;

export const extractForumPublicTopicSeeds = (
  values: readonly string[],
): string[] => {
  const corpus = values.join("\n");
  const seeds = TOPIC_CATEGORIES
    .filter(([, pattern]) => pattern.test(corpus))
    .map(([label]) => label);
  return seeds.length > 0 ? seeds.slice(0, 6) : ["日常生活"];
};

export const buildForumPublicPersona = (
  character: Character,
  protectedNames: readonly string[],
): string => {
  const source = `${character.personality || ""}\n${character.backstory || ""}`;
  const safeLines = source
    .split(/\r?\n|[。！？]/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !findForumPrivateNameViolation({
      text: line,
      protectedNames,
      allowedAuthorNames: [character.name, character.remark || ""],
    }))
    .slice(0, 5);
  return safeLines.join("；").slice(0, 500) || "自然、克制地参与公开讨论";
};

export const buildForumPublicSafeContext = (input: {
  character: Character;
  relationshipCompressedMemory?: string;
  recentMessages: readonly Message[];
  memories: readonly MemoryItem[];
  worldBookEntries: readonly WorldBookEntry[];
  protectedNames: readonly string[];
}): string => {
  const topicSeeds = extractForumPublicTopicSeeds([
    input.relationshipCompressedMemory || "",
    ...input.recentMessages.map((message) => message.content),
    ...input.memories.map((memory) => memory.content),
    ...input.worldBookEntries.map((entry) => `${entry.title} ${entry.content}`),
  ]);
  return `公开说话风格：${buildForumPublicPersona(input.character, input.protectedNames)}
仅可参考的话题类别：${topicSeeds.join("、")}
不得复述私人聊天、Memory 或 WorldBook 原句；不得公开私人姓名、昵称、身份信息或可识别细节。`;
};

const TOPIC_STOP_BIGRAMS = new Set([
  "这个", "那个", "我们", "你们", "他们", "什么", "怎么", "为何", "可以", "应该",
  "觉得", "一个", "没有", "就是", "真的", "还是", "如果", "因为", "所以", "但是",
  "然后", "时候", "问题", "内容", "回复", "帖子", "楼主", "感觉", "一下", "一些",
]);

const extractTopicTokens = (value: string): Set<string> => {
  const normalized = value.normalize("NFKC").toLowerCase();
  const tokens = new Set<string>();
  for (const latin of normalized.match(/[a-z0-9]{3,}/g) || []) tokens.add(latin);
  for (const segment of normalized.match(/[\p{Script=Han}]{2,}/gu) || []) {
    for (let index = 0; index < segment.length - 1; index += 1) {
      const token = segment.slice(index, index + 2);
      if (!TOPIC_STOP_BIGRAMS.has(token)) tokens.add(token);
    }
  }
  return tokens;
};

export const isForumGeneratedReplyRelevant = (input: {
  replyBody: string;
  threadTitle: string;
  threadBody: string;
  targetBody?: string;
}): boolean => {
  const publicTokens = extractTopicTokens(
    `${input.threadTitle}\n${input.threadBody}\n${input.targetBody || ""}`,
  );
  const replyTokens = extractTopicTokens(input.replyBody);
  if ([...replyTokens].some((token) => publicTokens.has(token))) return true;
  if (input.targetBody && /^(?:同意|赞同|确实|不一定|说得对|我也|反对|补充)/u.test(input.replyBody.trim())) {
    return true;
  }
  return publicTokens.size === 0 && replyBodyHasSubstance(input.replyBody);
};

const replyBodyHasSubstance = (value: string): boolean =>
  value.replace(/[^\p{L}\p{N}]/gu, "").length >= 6;

const isGeneratedThread = (thread: ForumThread): boolean =>
  thread.source === "ai-character"
  || thread.source === "ai-character-anonymous"
  || thread.source === "ai-virtual"
  || thread.source === "virtual";

const isGeneratedReply = (reply: ForumReply): boolean =>
  reply.source === "ai-character"
  || reply.source === "ai-character-anonymous"
  || reply.source === "ai-virtual";

const hiddenReply = (reply: ForumReply): ForumReply => ({
  ...reply,
  body: "该回复已删除",
  isDeleted: true,
  deletedAt: reply.deletedAt || reply.updatedAt || reply.createdAt,
  likedByIdentityIds: [],
});

export const sanitizeStoredForumContent = (input: {
  threads: readonly ForumThread[];
  replies: readonly ForumReply[];
  protectedNames: readonly string[];
}): { threads: ForumThread[]; replies: ForumReply[]; changed: boolean } => {
  let changed = false;
  const threads = input.threads.map((thread) => {
    if (!isGeneratedThread(thread)) return { ...thread };
    const title = sanitizeForumGeneratedText(thread.title);
    const body = sanitizeForumGeneratedText(thread.body);
    const allowedAuthorNames = thread.publicAuthor.isAnonymous
      ? []
      : [thread.publicAuthor.displayName];
    const privacyViolation = findForumPrivateNameViolation({
      text: `${title.text}\n${body.text}`,
      protectedNames: input.protectedNames,
      allowedAuthorNames,
    });
    if (!title.valid || !body.valid || privacyViolation) {
      changed = true;
      return {
        ...thread,
        title: "内容已隐藏",
        body: "该内容因论坛公开安全规则已隐藏。",
      };
    }
    if (title.changed || body.changed) {
      changed = true;
      return { ...thread, title: title.text, body: body.text };
    }
    return { ...thread };
  });

  const replies = input.replies.map((reply) => {
    if (!isGeneratedReply(reply) || reply.isDeleted) return { ...reply };
    const thread = threads.find((item) =>
      item.id === reply.threadId && item.ownerIdentityId === reply.ownerIdentityId);
    if (!thread) return { ...reply };
    const validated = sanitizeForumGeneratedText(reply.body);
    const trustedPublicReplies = input.replies.filter((item) =>
      item.threadId === thread.id
      && (item.source === "user" || item.source === "user-anonymous"));
    const privacyViolation = findForumPrivateNameViolation({
      text: validated.text,
      protectedNames: input.protectedNames,
      publicTexts: [
        thread.title,
        thread.body,
        ...trustedPublicReplies.map((item) => item.body),
      ],
      allowedAuthorNames: reply.publicAuthor.isAnonymous
        ? []
        : [reply.publicAuthor.displayName],
    });
    if (!validated.valid || privacyViolation) {
      changed = true;
      return hiddenReply(reply);
    }
    if (validated.changed) {
      changed = true;
      return { ...reply, body: validated.text };
    }
    return { ...reply };
  });
  return { threads, replies, changed };
};
