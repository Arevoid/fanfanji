import { validateForumGeneratedText } from "../../../domain/forum/forumContentSafety";
import { validateForumStoryRawOutput } from "../../forumStory/validators/forumStoryOutputValidator";

export interface ForumStoryPromptCharacter {
  name: string;
  role: string;
  personaSummary: string;
}

export interface ForumStoryInitialPromptContext {
  /** Deliberately a fixed scope label; internal story IDs are not sent to AI. */
  storyScope: "forum-story";
  theme: string;
  characters?: readonly ForumStoryPromptCharacter[];
  /** Optional public world background explicitly supplied for this story. */
  worldBackground?: string;
}

export interface ForumStoryInitialCandidate {
  title: string;
  body: string;
  author: ForumStoryPromptCharacter;
  characters: readonly ForumStoryPromptCharacter[];
  storyBackground: string;
  initialState: string;
}

export interface ForumStoryPrompt {
  systemInstruction: string;
  message: string;
}

const STORY_PRIVATE_MARKER_PATTERN = /\b(?:memory|relationship|innervoice|private\s+context|chat\s+history)\b|relationId|userIdentityId/i;

const clip = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const cleanPublicText = (value: unknown, maxLength: number, label: string): string => {
  const text = clip(value, maxLength);
  const validated = validateForumGeneratedText(text);
  if (!validated.valid || STORY_PRIVATE_MARKER_PATTERN.test(validated.text)) {
    throw new Error(`论坛故事初始内容无效：${label}`);
  }
  return validated.text;
};

const normalizePromptCharacter = (value: unknown): ForumStoryPromptCharacter => {
  if (!value || typeof value !== "object") throw new Error("论坛故事初始内容无效：角色对象");
  const record = value as Record<string, unknown>;
  return {
    name: cleanPublicText(record.name, 40, "角色名称"),
    role: cleanPublicText(record.role, 80, "角色身份"),
    personaSummary: cleanPublicText(record.personaSummary, 240, "角色人设摘要"),
  };
};

const deduplicateCharacters = (characters: readonly ForumStoryPromptCharacter[]): ForumStoryPromptCharacter[] => {
  const seen = new Set<string>();
  return characters.filter((character) => {
    const key = character.name.normalize("NFKC").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
};

const extractJsonValue = (text: string): unknown => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("论坛故事初始内容结构解析失败");
  return JSON.parse(cleaned.slice(start, end + 1));
};

export const buildForumStoryInitialPrompt = (
  context: ForumStoryInitialPromptContext,
): ForumStoryPrompt => {
  const theme = clip(context.theme, 500);
  if (!theme) throw new Error("论坛故事主题不能为空");
  const worldBackground = clip(context.worldBackground, 1200);
  const providedCharacters = (context.characters || [])
    .map(normalizePromptCharacter)
    .slice(0, 6);
  const characterText = providedCharacters.length > 0
    ? providedCharacters.map((character) => `- ${character.name}｜${character.role}｜${character.personaSummary}`).join("\n")
    : "无。请生成 1-4 个故事内角色。";

  return {
    systemInstruction: `你只负责生成一个论坛体故事的初始内容候选，不执行任何写入。
故事只存在于 forum-story scope，是虚构的公共论坛叙事；不得把它当作现实关系或其他应用事实。
不得读取或猜测 Memory、Relationship、用户私密信息、Chat 历史、InnerVoice、CharacterEvent 或未明确公开的世界设定。
只能使用用户提供的故事主题、明确允许的公共背景和故事内角色资料。
严格只输出一个 JSON 对象，不要 Markdown、解释文字或额外字段：
{"title":"标题","body":"初始帖子正文","author":{"name":"发帖身份","role":"故事角色","personaSummary":"故事内人设摘要"},"characters":[{"name":"角色名","role":"角色身份","personaSummary":"故事内人设摘要"}],"storyBackground":"故事背景","initialState":"故事开始时的初始状态"}
正文必须像自然的普通论坛首帖，不要动作旁白、心理标签、伪媒体、时间戳、内部 ID 或私密信息。首帖必须严格使用第一人称论坛发帖口吻，例如“我……”“我朋友……”“你们有没有发现……”“求助……”。即使是完整连载故事，也必须让楼主以自身视角陈述和提问；禁止写成“男主和女主……”式第三人称小说简介。首帖只抛出起因、悬念和当前困境，不要直接写出结局。characters 最多 6 个，author 必须出现在 characters 中。`,
    message: [
      `故事 scope：${context.storyScope}`,
      `故事主题：${theme}`,
      `明确允许的公共世界背景：${worldBackground || "无"}`,
      "可参考的故事内角色：",
      characterText,
      "请生成一个有起因、公开背景和清晰初始状态的故事首帖；必须采用第一人称论坛口吻，不要生成后续结局。",
    ].join("\n"),
  };
};

export const parseForumStoryInitialCandidate = (text: string): ForumStoryInitialCandidate => {
  const raw = extractJsonValue(text);
  const preflight = validateForumStoryRawOutput(raw, { rejectEmbeddedScopeReferences: true });
  if (!preflight.allowed) throw new Error(`ForumStory initial output rejected: ${preflight.rejectedReasons.join("; ")}`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("论坛故事初始内容结构解析失败");
  const record = raw as Record<string, unknown>;
  const author = normalizePromptCharacter(record.author);
  const suppliedCharacters = Array.isArray(record.characters)
    ? record.characters.map(normalizePromptCharacter)
    : [];
  const characters = deduplicateCharacters([author, ...suppliedCharacters]);
  if (characters.length === 0) throw new Error("论坛故事初始内容缺少角色");
  const normalizedAuthor = characters.find((character) => character.name === author.name) || author;
  return {
    title: cleanPublicText(record.title, 80, "故事标题"),
    body: cleanPublicText(record.body, 5000, "初始帖子正文"),
    author: normalizedAuthor,
    characters,
    storyBackground: cleanPublicText(record.storyBackground, 1000, "故事背景"),
    initialState: cleanPublicText(record.initialState, 500, "初始状态"),
  };
};

export const ForumStoryPromptAdapter = {
  buildInitialPrompt: buildForumStoryInitialPrompt,
  parseInitialCandidate: parseForumStoryInitialCandidate,
};
