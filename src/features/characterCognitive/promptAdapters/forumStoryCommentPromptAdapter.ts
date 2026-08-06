import { validateForumGeneratedText } from "../../../domain/forum/forumContentSafety";
import { validateForumStoryRawOutput } from "../../forumStory/validators/forumStoryOutputValidator";

export type ForumStoryCommentStyle =
  | "ordinary"
  | "gossip"
  | "rational"
  | "question"
  | "supplement";

export interface ForumStoryCommentCharacter {
  name: string;
  role: string;
  personaSummary: string;
}

export interface ForumStoryCommentSummary {
  authorName: string;
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
  existingComments?: readonly ForumStoryCommentSummary[];
  commentCount?: number;
}

export interface ForumStoryCommentCandidate {
  style: ForumStoryCommentStyle;
  authorName: string;
  content: string;
}

export interface ForumStoryCommentPrompt {
  systemInstruction: string;
  message: string;
}

const PRIVATE_MARKER_PATTERN = /\b(?:memory|relationship|innervoice|private\s+context|chat\s+history|character\s+event)\b|private[_\s-]*(?:memory|character|chat)|relationId|userIdentityId/i;
const STYLES = new Set<ForumStoryCommentStyle>(["ordinary", "gossip", "rational", "question", "supplement"]);

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
    name: cleanPublicText(record.name, 40, "character name"),
    role: cleanPublicText(record.role, 80, "character role"),
    personaSummary: cleanPublicText(record.personaSummary, 240, "character persona"),
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
  return {
    style: normalizeStyle(record.style ?? record.type),
    authorName: cleanPublicText(record.authorName ?? record.author, 40, "author name"),
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
  if (characters.length === 0) throw new Error("ForumStory comments require story characters");
  const existingComments = (context.existingComments || []).slice(-12).map((comment) => ({
    authorName: cleanPublicText(comment.authorName, 40, "existing author"),
    content: cleanPublicText(comment.content, 400, "existing comment"),
    ...(comment.style ? { style: normalizeStyle(comment.style) } : {}),
  }));
  const count = normalizeCount(context.commentCount);
  const characterText = characters.map((character) =>
    `- ${character.name} | ${character.role} | ${character.personaSummary}`).join("\n");
  const existingText = existingComments.length > 0
    ? existingComments.map((comment) => `- ${comment.authorName}: ${comment.content}`).join("\n")
    : "none";

  return {
    systemInstruction: [
      "You generate public comments for a fictional ForumStory scope only.",
      "Use only the supplied thread, story-scoped character projections, and public story comments.",
      "Do not read, infer, mention, or recreate Memory, Relationship, real Character entities, private user data, chat history, InnerVoice, CharacterEvent, userIdentityId, or relationId.",
      "Comment authors must be selected from the supplied story character names; do not create real users or real characters.",
      "Return one JSON object only: {\"comments\":[{\"style\":\"ordinary|gossip|rational|question|supplement\",\"authorName\":\"story character name\",\"content\":\"public comment\"}]}.",
      "Use distinct styles when possible, do not repeat an existing or another generated comment verbatim, and do not reveal a future ending.",
    ].join("\n"),
    message: [
      `Story scope: ${context.storyScope}`,
      `Thread title: ${title}`,
      `Initial post: ${initialContent}`,
      "Available story-scoped characters:",
      characterText,
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
