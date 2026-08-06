import { apiChat } from "../../../utils/apiHelper";
import type {
  ForumStory,
  StoryCharacter,
  StoryEvent,
  StoryEventInput,
  StoryThread,
} from "../../../domain/forumStory/forumStoryTypes";
import type {
  ForumStoryCommentCandidate,
  ForumStoryCommentCharacter,
  ForumStoryCommentPrompt,
  ForumStoryCommentStyle,
} from "../../characterCognitive/promptAdapters/forumStoryCommentPromptAdapter";
import {
  buildForumStoryCommentPrompt,
  parseForumStoryCommentCandidates,
} from "../../characterCognitive/promptAdapters/forumStoryCommentPromptAdapter";
import { ForumStoryRepository } from "../forumStoryRepository";
import { StoryCharacterRepository } from "../storyCharacterRepository";
import { StoryEventRepository } from "../storyEventRepository";
import {
  StoryForumReplyRepository,
  type StoryForumReply,
} from "../storyReplyRepository";
import { StoryThreadRepository } from "../storyThreadRepository";
import { validateForumStoryCommentCandidates } from "../validators/forumStoryOutputValidator";
import type { StorageWriteResult } from "../../../core/storage/storageTypes";

export interface ForumStoryCommentGenerationSettings {
  apiKey: string;
  selectedModel: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}

export interface ForumStoryCommentAiRequest {
  message: string;
  systemInstruction: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}

export type ForumStoryCommentAiCall = (request: ForumStoryCommentAiRequest) => Promise<{ text: string }>;

export interface GenerateForumStoryCommentsInput {
  storyId?: string;
  story?: ForumStory;
  /** Either name is accepted so callers can pass the domain's StoryThread directly. */
  thread?: StoryThread;
  storyThread?: StoryThread;
  characters?: readonly StoryCharacter[];
  storyCharacters?: readonly StoryCharacter[];
  settings: ForumStoryCommentGenerationSettings;
  count?: number;
  now?: number;
  aiCall?: ForumStoryCommentAiCall;
}

export interface ForumStoryCommentGenerationResult {
  story: ForumStory;
  thread: StoryThread;
  replies: readonly StoryForumReply[];
  events: readonly StoryEvent[];
  candidates: readonly ForumStoryCommentCandidate[];
  prompt: ForumStoryCommentPrompt;
}

const makeId = (prefix: string): string => {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
};

const defaultAiCall: ForumStoryCommentAiCall = (request) => apiChat({ ...request, history: [] });

const ensureWrite = (result: StorageWriteResult, label: string): void => {
  if (!result.success) throw new Error(`ForumStory ${label} save failed`);
};

const normalize = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

const fingerprint = (value: string): string => {
  let hash = 2166136261;
  for (const character of normalize(value)) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const commentCharacterProjection = (characters: readonly StoryCharacter[]): ForumStoryCommentCharacter[] =>
  characters.map((character) => ({
    name: character.identity.name,
    role: character.role,
    personaSummary: character.personaSummary,
  }));

const generateCandidates = async (input: {
  prompt: ForumStoryCommentPrompt;
  settings: ForumStoryCommentGenerationSettings;
  aiCall: ForumStoryCommentAiCall;
}): Promise<ForumStoryCommentCandidate[]> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await input.aiCall({
        message: input.prompt.message,
        systemInstruction: attempt === 0
          ? input.prompt.systemInstruction
          : `${input.prompt.systemInstruction}\nPrevious output failed validation. Return only the requested JSON object.`,
        apiKey: input.settings.apiKey,
        model: input.settings.selectedModel,
        apiEndpoint: input.settings.apiEndpoint,
        apiTemperature: input.settings.apiTemperature,
        streamCompatible: input.settings.streamCompatible,
      });
      return parseForumStoryCommentCandidates(response.text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ForumStory comment generation failed");
};

const selectThread = (input: GenerateForumStoryCommentsInput, storyId: string): StoryThread => {
  const thread = input.thread || input.storyThread;
  if (!thread) throw new Error("ForumStory comment generation requires a StoryThread");
  if (thread.storyId !== storyId) throw new Error("StoryThread scope mismatch");
  if (thread.status !== "open") throw new Error("StoryThread is closed");
  return thread;
};

const findAuthor = (characters: readonly StoryCharacter[], authorName: string): StoryCharacter | undefined => {
  const wanted = normalize(authorName);
  return characters.find((character) => normalize(character.identity.name) === wanted && character.status === "active");
};

const selectCharacters = (input: GenerateForumStoryCommentsInput, storyId: string): StoryCharacter[] => {
  const persisted = StoryCharacterRepository.getStoryCharactersByStoryId(storyId);
  if (persisted.length > 0) return persisted.filter((character) => character.status === "active");
  return (input.characters || input.storyCharacters || [])
    .filter((character) => character.storyId === storyId && character.status === "active");
};

const publicStyle = (style: ForumStoryCommentStyle): string => {
  switch (style) {
    case "gossip": return "吃瓜网友";
    case "rational": return "理性分析网友";
    case "question": return "提问网友";
    case "supplement": return "补充信息网友";
    default: return "普通网友";
  }
};

/**
 * Generates story-scoped comments. It never reads private character data and
 * persists replies in the isolated story-reply key, not the live Forum table.
 */
export const generateStoryComments = async (
  input: GenerateForumStoryCommentsInput,
): Promise<ForumStoryCommentGenerationResult> => {
  const suppliedThread = input.thread || input.storyThread;
  const storyId = (input.storyId || input.story?.id || suppliedThread?.storyId || "").trim();
  if (!storyId) throw new Error("ForumStory id is required");
  const story = input.story?.id === storyId ? input.story : ForumStoryRepository.getStory(storyId);
  if (!story) throw new Error("ForumStory does not exist");
  if (story.status === "completed") throw new Error("ForumStory is completed");
  const thread = selectThread(input, storyId);
  const storedThread = StoryThreadRepository.getThread(storyId, thread.id);
  if (storedThread && storedThread.storyId !== storyId) throw new Error("StoryThread scope mismatch");
  const characters = selectCharacters(input, storyId);
  if (characters.length === 0) throw new Error("ForumStory comments require story-scoped characters");
  const existingReplies = StoryForumReplyRepository.listReplies(storyId, thread.id);
  const prompt = buildForumStoryCommentPrompt({
    storyScope: "forum-story",
    thread: { title: thread.title, initialContent: thread.initialContent },
    characters: commentCharacterProjection(characters),
    existingComments: existingReplies.map((reply) => ({
      authorName: reply.publicAuthor.displayName,
      content: reply.body,
      style: reply.storyCommentStyle,
    })),
    commentCount: input.count,
  });
  const parsedCandidates = await generateCandidates({
    prompt,
    settings: input.settings,
    aiCall: input.aiCall || defaultAiCall,
  });
  const validation = validateForumStoryCommentCandidates(parsedCandidates, {
    storyId,
    storyCharacterIds: characters.map((character) => character.id),
    storyThreadIds: [thread.id],
  });
  if (!validation.allowed || !validation.sanitizedData) {
    throw new Error(`ForumStory comment output rejected: ${validation.rejectedReasons.join("; ")}`);
  }
  const candidates = validation.sanitizedData;
  const now = input.now ?? Date.now();
  const existingBodies = new Set(existingReplies.map((reply) => normalize(reply.body)));
  const replyResults: StoryForumReply[] = [];
  const eventResults: StoryEvent[] = [];
  let nextFloor = existingReplies.reduce((max, reply) => Math.max(max, reply.floor), 1) + 1;

  for (const candidate of candidates) {
    const bodyKey = normalize(candidate.content);
    const author = findAuthor(characters, candidate.authorName);
    if (!author || !bodyKey || existingBodies.has(bodyKey)) continue;
    const replyId = makeId("forum-story-reply");
    const reply: StoryForumReply = {
      storyId,
      id: replyId,
      threadId: thread.id,
      ownerIdentityId: `story-scope:${storyId}`,
      floor: nextFloor,
      publicAuthor: {
        displayName: author.identity.name,
        ...(author.identity.avatar ? { avatar: author.identity.avatar } : {}),
        kind: "virtual",
        isAnonymous: false,
      },
      body: candidate.content,
      source: "ai-virtual",
      occurredAt: now,
      baseLikeCount: 0,
      likedByIdentityIds: [],
      createdAt: now,
      updatedAt: now,
      storyCommentStyle: candidate.style,
      storyCommentLabel: publicStyle(candidate.style),
    };
    ensureWrite(StoryForumReplyRepository.appendReply(reply), "comment");
    const eventInput: StoryEventInput = {
      id: makeId("forum-story-event"),
      storyId,
      type: "comment_added",
      source: "npc",
      status: "confirmed",
      summary: `${publicStyle(candidate.style)} ${author.identity.name}: ${candidate.content}`,
      storyVersion: story.version,
      occurredAt: now,
      createdAt: now,
      actorIds: [author.id],
      forumThreadId: thread.id,
      forumReplyId: replyId,
      idempotencyKey: `${storyId}:comment:${fingerprint(candidate.content)}`,
    };
    const eventWrite = StoryEventRepository.appendEvent(eventInput);
    ensureWrite(eventWrite, "comment event");
    if (!eventWrite.event) throw new Error("ForumStory comment event read failed");
    const event = eventWrite.event;
    replyResults.push(reply);
    eventResults.push(event);
    existingBodies.add(bodyKey);
    nextFloor += 1;
  }

  return {
    story,
    thread,
    replies: replyResults,
    events: eventResults,
    candidates,
    prompt,
  };
};

export const ForumStoryCommentService = {
  generateStoryComments,
};

export const forumStoryCommentService = ForumStoryCommentService;
