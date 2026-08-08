import { validateForumGeneratedText } from "../../../domain/forum/forumContentSafety";
import type { ForumStoryStatus } from "../../../domain/forumStory/forumStoryTypes";
import { validateForumStoryRawOutput } from "../../forumStory/validators/forumStoryOutputValidator";

export interface ForumStoryUpdatePromptCharacter {
  name: string;
  role: string;
  personaSummary: string;
}

export interface ForumStoryUpdatePromptEvent {
  type: "post_created" | "comment_added" | "update_published" | "story_progressed" | "story_completed";
  sequence: number;
  summary: string;
}

export interface ForumStoryUpdatePromptComment {
  authorName: string;
  content: string;
}

export interface ForumStoryUpdatePromptContext {
  storyScope: "forum-story";
  story: {
    title: string;
    premise: string;
    status: ForumStoryStatus;
    currentEpisode: number;
  };
  thread: {
    title: string;
    initialContent: string;
  };
  characters: readonly ForumStoryUpdatePromptCharacter[];
  events: readonly ForumStoryUpdatePromptEvent[];
  comments?: readonly ForumStoryUpdatePromptComment[];
  conclude?: boolean;
}

export interface ForumStoryUpdateCandidate {
  title?: string;
  content: string;
  eventProgression: string;
}

export interface ForumStoryUpdatePrompt {
  systemInstruction: string;
  message: string;
}

const PRIVATE_MARKER_PATTERN = /\b(?:memory|relationship|innervoice|private\s+context|chat\s+history|character\s+event)\b|private[_\s-]*(?:memory|character|chat)|relationId|userIdentityId/i;

const clip = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const cleanPublicText = (value: unknown, maxLength: number, label: string): string => {
  const text = clip(value, maxLength);
  const validated = validateForumGeneratedText(text);
  if (!validated.valid || PRIVATE_MARKER_PATTERN.test(validated.text)) {
    throw new Error(`ForumStory update ${label} is not safe`);
  }
  return validated.text;
};

const normalizeCharacter = (value: unknown): ForumStoryUpdatePromptCharacter => {
  if (!value || typeof value !== "object") throw new Error("ForumStory update character is invalid");
  const record = value as Record<string, unknown>;
  return {
    name: cleanPublicText(record.name, 40, "character name"),
    role: cleanPublicText(record.role, 80, "character role"),
    personaSummary: cleanPublicText(record.personaSummary, 240, "character persona"),
  };
};

const normalizeEvent = (value: unknown): ForumStoryUpdatePromptEvent => {
  if (!value || typeof value !== "object") throw new Error("ForumStory update event is invalid");
  const record = value as Record<string, unknown>;
  const type = record.type;
  const validTypes = ["post_created", "comment_added", "update_published", "story_progressed", "story_completed"] as const;
  if (!validTypes.includes(type as typeof validTypes[number])) throw new Error("ForumStory update event type is invalid");
  const sequence = typeof record.sequence === "number" && Number.isInteger(record.sequence) ? record.sequence : 0;
  if (sequence < 1) throw new Error("ForumStory update event sequence is invalid");
  return {
    type: type as ForumStoryUpdatePromptEvent["type"],
    sequence,
    summary: cleanPublicText(record.summary, 600, "event summary"),
  };
};

const deduplicateCharacters = (characters: readonly ForumStoryUpdatePromptCharacter[]): ForumStoryUpdatePromptCharacter[] => {
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
  if (start < 0 || end < start) throw new Error("ForumStory update JSON parse failed");
  return JSON.parse(cleaned.slice(start, end + 1));
};

export const buildForumStoryUpdatePrompt = (
  context: ForumStoryUpdatePromptContext,
): ForumStoryUpdatePrompt => {
  const storyTitle = cleanPublicText(context.story.title, 120, "story title");
  const premise = cleanPublicText(context.story.premise, 1200, "story premise");
  const threadTitle = cleanPublicText(context.thread.title, 120, "thread title");
  const initialContent = cleanPublicText(context.thread.initialContent, 5000, "thread content");
  const characters = deduplicateCharacters(context.characters.map(normalizeCharacter));
  if (characters.length === 0) throw new Error("ForumStory update requires story characters");
  const events = context.events.slice(-24).map(normalizeEvent);
  if (events.length === 0) throw new Error("ForumStory update requires story events");
  const comments = (context.comments || []).slice(-12).map((comment) => ({
    authorName: cleanPublicText(comment.authorName, 40, "comment author"),
    content: cleanPublicText(comment.content, 500, "comment content"),
  }));

  return {
    systemInstruction: [
      "You generate one public continuation update for a fictional ForumStory scope only.",
      "Use only the supplied current story state, public StoryThread, story-scoped characters, immutable public StoryEvents, and public comment summaries.",
      "Do not read, infer, mention, or recreate Memory, Relationship, real Character entities, private user data, chat history, InnerVoice, CharacterEvent, userIdentityId, or relationId.",
      "Do not rewrite or contradict historical events. Advance only from the supplied facts and do not invent an unauthorized real-world fact.",
      context.conclude
        ? "Write the final public楼主更新: resolve the central conflict only from established facts and give readers a satisfying concise ending."
        : "The update must move the fictional story one episode forward without revealing a final ending.",
      "Do not add private context or use roleplay stage directions, hidden reasoning, timestamps, or internal IDs.",
      "Return one JSON object only: {\"title\":\"optional public title\",\"content\":\"public author update body\",\"eventProgression\":\"what public story event moved forward\"}.",
    ].join("\n"),
    message: [
      `Story scope: ${context.storyScope}`,
      `Current story state: status=${context.story.status}; episode=${context.story.currentEpisode}`,
      `Story title: ${storyTitle}`,
      `Story premise: ${premise}`,
      `Thread title: ${threadTitle}`,
      `Initial post: ${initialContent}`,
      "Story-scoped characters:",
      characters.map((character) => `- ${character.name} | ${character.role} | ${character.personaSummary}`).join("\n"),
      "Immutable public event timeline:",
      events.map((event) => `- #${event.sequence} ${event.type}: ${event.summary}`).join("\n"),
      "Recent public comments:",
      comments.length > 0 ? comments.map((comment) => `- ${comment.authorName}: ${comment.content}`).join("\n") : "none",
      context.conclude
        ? "Write the final public楼主更新. Keep it grounded in the timeline and comments; resolve the whole story now."
        : "Write the next public楼主更新. Keep it grounded in the timeline and comments; do not conclude the entire story.",
    ].join("\n"),
  };
};

export const parseForumStoryUpdateCandidate = (text: string): ForumStoryUpdateCandidate => {
  const raw = extractJsonValue(text);
  const preflight = validateForumStoryRawOutput(raw, { rejectEmbeddedScopeReferences: true });
  if (!preflight.allowed) throw new Error(`ForumStory update output rejected: ${preflight.rejectedReasons.join("; ")}`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("ForumStory update must be an object");
  const record = raw as Record<string, unknown>;
  const title = clip(record.title, 120);
  if (title) cleanPublicText(title, 120, "update title");
  return {
    ...(title ? { title: cleanPublicText(title, 120, "update title") } : {}),
    content: cleanPublicText(record.content ?? record.body, 5000, "update content"),
    eventProgression: cleanPublicText(record.eventProgression ?? record.eventSummary, 1200, "event progression"),
  };
};

export const ForumStoryUpdatePromptAdapter = {
  buildPrompt: buildForumStoryUpdatePrompt,
  parseCandidate: parseForumStoryUpdateCandidate,
};
