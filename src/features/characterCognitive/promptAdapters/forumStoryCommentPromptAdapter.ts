import { validateForumGeneratedText } from "../../../domain/forum/forumContentSafety";
import { validateForumStoryRawOutput } from "../../forumStory/validators/forumStoryOutputValidator";

export type ForumStoryCommentStyle =
  | "ordinary"
  | "gossip"
  | "rational"
  | "question"
  | "supplement";

export type ForumStoryCommentAuthorType = "story_character" | "forum_user";

export type ForumStoryCommentForumUserType =
  | "anonymous"
  | "observer"
  | "insider"
  | "analyst"
  | "supporter"
  | "skeptic";

export interface ForumStoryCommentCharacter {
  /** Opaque prompt reference; never needs to be a real Character ID. */
  id?: string;
  name: string;
  role: string;
  personaSummary: string;
}

export interface ForumStoryCommentForumUser {
  /** Opaque story-scoped prompt reference. */
  id: string;
  displayName: string;
  userType: ForumStoryCommentForumUserType;
  style: string;
  personaSummary: string;
}

export interface ForumStoryCommentSummary {
  authorName?: string;
  authorType?: ForumStoryCommentAuthorType;
  authorId?: string;
  floorNumber?: number;
  content: string;
  style?: ForumStoryCommentStyle;
}

export interface ForumStoryCommentPromptContext {
  /** A fixed label, never an internal story id. */
  storyScope: "forum-story";
  thread: {
    title: string;
    initialContent: string;
  };
  characters: readonly ForumStoryCommentCharacter[];
  forumUsers?: readonly ForumStoryCommentForumUser[];
  storyForumUsers?: readonly ForumStoryCommentForumUser[];
  existingComments?: readonly ForumStoryCommentSummary[];
  commentCount?: number;
}

export interface ForumStoryCommentCandidate {
  style: ForumStoryCommentStyle;
  /** New schema: select an existing story character or forum user by ID. */
  authorType?: ForumStoryCommentAuthorType;
  authorId?: string;
  /** Legacy schema compatibility; the service resolves this by display name. */
  authorName?: string;
  /** Existing floor number being replied to; resolved to a reply ID by the service. */
  replyToFloor?: number;
  quoteContent?: string;
  content: string;
}

export interface ForumStoryCommentPrompt {
  systemInstruction: string;
  message: string;
}

const PRIVATE_MARKER_PATTERN = /\b(?:memory|relationship|innervoice|private\s+context|chat\s+history|character\s+event)\b|private[_\s-]*(?:memory|character|chat)|relationId|userIdentityId/i;
const STYLES = new Set<ForumStoryCommentStyle>(["ordinary", "gossip", "rational", "question", "supplement"]);
const AUTHOR_TYPES = new Set<ForumStoryCommentAuthorType>(["story_character", "forum_user"]);
const FORUM_USER_TYPES = new Set<ForumStoryCommentForumUserType>([
  "anonymous", "observer", "insider", "analyst", "supporter", "skeptic",
]);

const clip = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const cleanPublicText = (value: unknown, maxLength: number, label: string): string => {
  const text = clip(value, maxLength);
  const validated = validateForumGeneratedText(text);
  if (!validated.valid || PRIVATE_MARKER_PATTERN.test(validated.text)) {
    throw new Error(`ForumStory comment ${label} is not safe`);
  }
  return validated.text;
};

const normalizeCharacter = (value: unknown): ForumStoryCommentCharacter => {
  if (!value || typeof value !== "object") throw new Error("ForumStory comment character is invalid");
  const record = value as Record<string, unknown>;
  return {
    ...(record.id !== undefined ? { id: cleanPublicText(record.id, 120, "character id") } : {}),
    name: cleanPublicText(record.name, 40, "character name"),
    role: cleanPublicText(record.role, 80, "character role"),
    personaSummary: cleanPublicText(record.personaSummary, 240, "character persona"),
  };
};

const normalizeForumUser = (value: unknown): ForumStoryCommentForumUser => {
  if (!value || typeof value !== "object") throw new Error("ForumStory comment forum user is invalid");
  const record = value as Record<string, unknown>;
  const userType = clip(record.userType, 30).toLowerCase() as ForumStoryCommentForumUserType;
  if (!FORUM_USER_TYPES.has(userType)) throw new Error("ForumStory comment forum user type is invalid");
  return {
    id: cleanPublicText(record.id, 120, "forum user id"),
    displayName: cleanPublicText(record.displayName ?? record.name, 40, "forum user name"),
    userType,
    style: cleanPublicText(record.style, 80, "forum user style"),
    personaSummary: cleanPublicText(record.personaSummary, 240, "forum user persona"),
  };
};

const deduplicateCharacters = (characters: readonly ForumStoryCommentCharacter[]): ForumStoryCommentCharacter[] => {
  const seen = new Set<string>();
  return characters.filter((character) => {
    const key = character.name.normalize("NFKC").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
};

const extractJsonValue = (text: string): unknown => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("ForumStory comment JSON parse failed");
  return JSON.parse(cleaned.slice(start, end + 1));
};

const normalizeAuthorType = (value: unknown): ForumStoryCommentAuthorType | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = clip(value, 40).toLowerCase().replace(/[ -]/g, "_");
  const aliases: Record<string, ForumStoryCommentAuthorType> = {
    story_character: "story_character",
    storycharacter: "story_character",
    character: "story_character",
    npc: "story_character",
    forum_user: "forum_user",
    forumuser: "forum_user",
    story_forum_user: "forum_user",
    storyforumuser: "forum_user",
    user: "forum_user",
    anonymous_user: "forum_user",
  };
  const type = aliases[raw];
  if (!type || !AUTHOR_TYPES.has(type)) throw new Error("ForumStory comment author type is invalid");
  return type;
};

const normalizeReplyToFloor = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const floor = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(floor) || floor < 2) throw new Error("ForumStory comment reply floor is invalid");
  return floor;
};

const normalizeStyle = (value: unknown): ForumStoryCommentStyle => {
  const raw = clip(value, 30).toLowerCase();
  const aliases: Record<string, ForumStoryCommentStyle> = {
    ordinary: "ordinary",
    "ordinary netizen": "ordinary",
    "普通网友": "ordinary",
    gossip: "gossip",
    "gossip netizen": "gossip",
    "吃瓜网友": "gossip",
    rational: "rational",
    "rational analyst": "rational",
    "理性分析": "rational",
    question: "question",
    "questioning netizen": "question",
    "提问网友": "question",
    supplement: "supplement",
    "supplementary information": "supplement",
    "补充信息网友": "supplement",
  };
  const style = aliases[raw] || raw as ForumStoryCommentStyle;
  if (!STYLES.has(style)) throw new Error("ForumStory comment style is invalid");
  return style;
};

const normalizeComment = (value: unknown): ForumStoryCommentCandidate => {
  if (!value || typeof value !== "object") throw new Error("ForumStory comment is invalid");
  const record = value as Record<string, unknown>;
  const nestedAuthor = record.author && typeof record.author === "object" && !Array.isArray(record.author)
    ? record.author as Record<string, unknown>
    : undefined;
  const authorType = normalizeAuthorType(record.authorType ?? nestedAuthor?.authorType ?? nestedAuthor?.type);
  const rawAuthorId = record.authorId ?? nestedAuthor?.id;
  const authorId = rawAuthorId === undefined
    ? undefined
    : cleanPublicText(rawAuthorId, 120, "author id");
  const rawAuthorName = record.authorName ?? (nestedAuthor?.displayName ?? nestedAuthor?.name) ?? (typeof record.author === "string" ? record.author : undefined);
  const authorName = rawAuthorName === undefined
    ? undefined
    : cleanPublicText(rawAuthorName, 40, "author name");
  if (authorType && !authorId) throw new Error("ForumStory comment author id is missing");
  if (!authorType && !authorName) throw new Error("ForumStory comment author is missing");
  const replyToFloor = normalizeReplyToFloor(record.replyToFloor ?? record.replyToFloorNumber);
  const quoteContent = record.quoteContent === undefined
    ? undefined
    : cleanPublicText(record.quoteContent, 500, "quote content");
  if (quoteContent && replyToFloor === undefined) throw new Error("ForumStory comment quote floor is missing");
  return {
    style: normalizeStyle(record.style ?? record.type ?? "ordinary"),
    ...(authorType ? { authorType } : {}),
    ...(authorId ? { authorId } : {}),
    ...(authorName ? { authorName } : {}),
    ...(replyToFloor !== undefined ? { replyToFloor } : {}),
    ...(quoteContent ? { quoteContent } : {}),
    content: cleanPublicText(record.content ?? record.body, 1000, "content"),
  };
};

const normalizeCount = (value: unknown): number => {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 3;
  return Math.max(1, Math.min(5, count));
};

export const buildForumStoryCommentPrompt = (
  context: ForumStoryCommentPromptContext,
): ForumStoryCommentPrompt => {
  const title = cleanPublicText(context.thread.title, 120, "thread title");
  const initialContent = cleanPublicText(context.thread.initialContent, 5000, "thread content");
  const characters = deduplicateCharacters(context.characters.map(normalizeCharacter));
  const forumUsers = (context.forumUsers || context.storyForumUsers || []).map(normalizeForumUser).slice(0, 20);
  if (characters.length === 0 && forumUsers.length === 0) throw new Error("ForumStory comments require story-scoped authors");
  const existingComments = (context.existingComments || []).slice(-12).map((comment) => ({
    ...(comment.authorName ? { authorName: cleanPublicText(comment.authorName, 40, "existing author") } : {}),
    ...(comment.authorType ? { authorType: comment.authorType } : {}),
    ...(comment.authorId ? { authorId: cleanPublicText(comment.authorId, 120, "existing author id") } : {}),
    ...(comment.floorNumber !== undefined ? { floorNumber: comment.floorNumber } : {}),
    content: cleanPublicText(comment.content, 400, "existing comment"),
    ...(comment.style ? { style: normalizeStyle(comment.style) } : {}),
  }));
  const count = normalizeCount(context.commentCount);
  const characterText = characters.map((character) =>
    `- ${character.id ? `[id=${character.id}] ` : ""}${character.name} | ${character.role} | ${character.personaSummary}`).join("\n");
  const forumUserText = forumUsers.length > 0
    ? forumUsers.map((user) =>
      `- [id=${user.id}] ${user.displayName} | type=${user.userType} | style=${user.style} | ${user.personaSummary}`).join("\n")
    : "none";
  const existingText = existingComments.length > 0
    ? existingComments.map((comment) =>
      `- [floor=${comment.floorNumber || "?"}] ${comment.authorName || `${comment.authorType || "author"}:${comment.authorId || "unknown"}`}: ${comment.content}`).join("\n")
    : "none";

  return {
    systemInstruction: [
      "You generate public comments for a fictional ForumStory scope only.",
      "Use only the supplied thread, story-scoped character projections, and public story comments.",
      "Do not read, infer, mention, or recreate Memory, Relationship, real Character entities, private user data, chat history, InnerVoice, CharacterEvent, userIdentityId, or relationId.",
      "Comment authors must be selected from the supplied story-character or StoryForumUser pool; never invent a user, real User, or real Character.",
      "For each comment return authorType (story_character or forum_user), authorId copied exactly from the supplied pool, and content. style is optional and may be ordinary|gossip|rational|question|supplement.",
      "A reply may include replyToFloor using only a listed existing floor, plus an optional quoteContent excerpt. Do not invent floors.",
      "Return one JSON object only: {\"comments\":[{\"authorType\":\"forum_user\",\"authorId\":\"existing pool id\",\"style\":\"ordinary\",\"replyToFloor\":2,\"quoteContent\":\"quoted excerpt\",\"content\":\"public comment\"}]}.",
      "Use distinct styles when possible, do not repeat an existing or another generated comment verbatim, and do not reveal a future ending.",
    ].join("\n"),
    message: [
      `Story scope: ${context.storyScope}`,
      `Thread title: ${title}`,
      `Initial post: ${initialContent}`,
      "Available story-scoped characters:",
      characterText || "none",
      "Available StoryForumUser identities (story scope only):",
      forumUserText,
      "Existing public story comments:",
      existingText,
      `Generate ${count} comments with varied styles: ordinary netizen, gossip netizen, rational analyst, questioning netizen, or supplementary-information netizen.`,
    ].join("\n"),
  };
};

export const parseForumStoryCommentCandidates = (text: string): ForumStoryCommentCandidate[] => {
  const raw = extractJsonValue(text);
  const preflight = validateForumStoryRawOutput(raw, { rejectEmbeddedScopeReferences: true });
  if (!preflight.allowed) throw new Error(`ForumStory comment output rejected: ${preflight.rejectedReasons.join("; ")}`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("ForumStory comments must be an object");
  const comments = (raw as Record<string, unknown>).comments;
  if (!Array.isArray(comments)) throw new Error("ForumStory comments are missing");
  return comments.map(normalizeComment).slice(0, 5);
};

export const ForumStoryCommentPromptAdapter = {
  buildPrompt: buildForumStoryCommentPrompt,
  parseCandidates: parseForumStoryCommentCandidates,
};
