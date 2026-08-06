import { apiChat } from "../../../utils/apiHelper";
import type {
  ForumStory,
  StoryCharacter,
  StoryEvent,
  StoryEventInput,
  StoryForumUser,
  StoryThread,
} from "../../../domain/forumStory/forumStoryTypes";
import type {
  ForumStoryCommentCandidate,
  ForumStoryCommentCharacter,
  ForumStoryCommentForumUser,
  ForumStoryCommentPrompt,
  ForumStoryCommentStyle,
} from "../../characterCognitive/promptAdapters/forumStoryCommentPromptAdapter";
import {
  buildForumStoryCommentPrompt,
  parseForumStoryCommentCandidates,
} from "../../characterCognitive/promptAdapters/forumStoryCommentPromptAdapter";
import { ForumStoryRepository } from "../forumStoryRepository";
import { StoryCharacterRepository } from "../storyCharacterRepository";
import { StoryForumUserRepository } from "../storyForumUserRepository";
import { StoryEventRepository } from "../storyEventRepository";
import {
  StoryForumReplyRepository,
  type StoryForumReplyInput,
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
  /** Optional story-scoped anonymous users to seed into the repository. */
  forumUsers?: readonly StoryForumUser[];
  storyForumUsers?: readonly StoryForumUser[];
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
  characters.map((character, index) => ({
    id: `story-character-${index + 1}`,
    name: character.identity.name,
    role: character.role,
    personaSummary: character.personaSummary,
  }));

const commentForumUserProjection = (users: readonly StoryForumUser[]): ForumStoryCommentForumUser[] =>
  users.map((user, index) => ({
    id: `story-forum-user-${index + 1}`,
    displayName: user.displayName,
    userType: user.userType,
    style: user.style,
    personaSummary: user.personaSummary,
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

const findCharacterByName = (characters: readonly StoryCharacter[], authorName: string): StoryCharacter | undefined => {
  const wanted = normalize(authorName);
  return characters.find((character) => normalize(character.identity.name) === wanted && character.status === "active");
};

const findCharacterById = (characters: readonly StoryCharacter[], authorId: string): StoryCharacter | undefined =>
  characters.find((character, index) => character.id === authorId || `story-character-${index + 1}` === authorId);

const findForumUserById = (users: readonly StoryForumUser[], authorId: string): StoryForumUser | undefined =>
  users.find((user, index) => user.id === authorId || `story-forum-user-${index + 1}` === authorId);

const findForumUserByName = (users: readonly StoryForumUser[], authorName: string): StoryForumUser | undefined => {
  const wanted = normalize(authorName);
  return users.find((user) => normalize(user.displayName) === wanted);
};

const selectCharacters = (input: GenerateForumStoryCommentsInput, storyId: string): StoryCharacter[] => {
  const persisted = StoryCharacterRepository.getStoryCharactersByStoryId(storyId);
  if (persisted.length > 0) return persisted.filter((character) => character.status === "active");
  return (input.characters || input.storyCharacters || [])
    .filter((character) => character.storyId === storyId && character.status === "active");
};

const selectForumUsers = (input: GenerateForumStoryCommentsInput, storyId: string): StoryForumUser[] => {
  const persisted = StoryForumUserRepository.getUsersByStoryId(storyId);
  const supplied = (input.forumUsers || input.storyForumUsers || [])
    .filter((user) => user.storyId === storyId);
  for (const user of supplied) {
    if (!persisted.some((item) => item.id === user.id)) StoryForumUserRepository.createUser(user);
  }
  return StoryForumUserRepository.getUsersByStoryId(storyId);
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
  const forumUsers = selectForumUsers(input, storyId);
  if (characters.length === 0 && forumUsers.length === 0) throw new Error("ForumStory comments require story-scoped authors");
  const existingReplies = StoryForumReplyRepository.listReplies(storyId, thread.id);
  const prompt = buildForumStoryCommentPrompt({
    storyScope: "forum-story",
    thread: { title: thread.title, initialContent: thread.initialContent },
    characters: commentCharacterProjection(characters),
    ...(forumUsers.length > 0 ? { forumUsers: commentForumUserProjection(forumUsers) } : {}),
    existingComments: existingReplies.map((reply) => ({
      authorName: reply.publicAuthor.displayName,
      floorNumber: reply.floorNumber ?? reply.floor,
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
    storyCharacterIds: characters.flatMap((character, index) => [character.id, `story-character-${index + 1}`]),
    storyForumUserIds: forumUsers.flatMap((user, index) => [user.id, `story-forum-user-${index + 1}`]),
    storyReplyFloors: existingReplies.map((reply) => reply.floorNumber ?? reply.floor),
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

  for (const candidate of candidates) {
    const bodyKey = normalize(candidate.content);
    const authorType = candidate.authorType;
    const legacyForumUser = !authorType && candidate.authorName
      ? findForumUserByName(forumUsers, candidate.authorName)
      : undefined;
    const author = authorType === "story_character"
      ? findCharacterById(characters, candidate.authorId || "")
      : authorType === "forum_user"
        ? undefined
        : candidate.authorName ? findCharacterByName(characters, candidate.authorName) : undefined;
    const forumUser = authorType === "forum_user"
      ? findForumUserById(forumUsers, candidate.authorId || "")
      : legacyForumUser;
    if ((!author && !forumUser) || !bodyKey || existingBodies.has(bodyKey)) continue;
    const resolvedAuthorType = forumUser ? "forum_user" : "story_character";
    const resolvedAuthorId = forumUser?.id || author?.id;
    if (!resolvedAuthorId) continue;
    const normalizedForumStyle = forumUser ? normalize(forumUser.style) : "";
    const replyStyle = forumUser && ["ordinary", "gossip", "rational", "question", "supplement"].includes(normalizedForumStyle)
      ? normalizedForumStyle as ForumStoryCommentStyle
      : candidate.style;
    const replyId = makeId("forum-story-reply");
    const parentReply = candidate.replyToFloor === undefined
      ? undefined
      : existingReplies.find((item) => (item.floorNumber ?? item.floor) === candidate.replyToFloor);
    if (candidate.replyToFloor !== undefined && !parentReply) continue;
    const replyInput: StoryForumReplyInput = {
      storyId,
      id: replyId,
      threadId: thread.id,
      ownerIdentityId: `story-scope:${storyId}`,
      publicAuthor: {
        displayName: forumUser?.displayName || author?.identity.name || "故事网友",
        ...(author?.identity.avatar ? { avatar: author.identity.avatar } : {}),
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
      storyAuthorType: resolvedAuthorType,
      storyAuthorId: resolvedAuthorId,
      ...(forumUser ? { storyForumUserStyle: forumUser.style } : {}),
      ...(parentReply ? { parentReplyId: parentReply.id } : {}),
      ...(parentReply?.storyAuthorId ? { replyToUserId: parentReply.storyAuthorId } : {}),
      ...(candidate.quoteContent ? { quoteContent: candidate.quoteContent } : {}),
      storyCommentStyle: replyStyle,
      storyCommentLabel: publicStyle(replyStyle),
    };
    const replyWrite = StoryForumReplyRepository.appendReply(replyInput);
    ensureWrite(replyWrite, "comment");
    if (!replyWrite.reply) throw new Error("ForumStory comment reply read failed");
    const reply = replyWrite.reply;
    const eventInput: StoryEventInput = {
      id: makeId("forum-story-event"),
      storyId,
      type: "comment_added",
      source: "npc",
      status: "confirmed",
      summary: `${publicStyle(replyStyle)} ${forumUser?.displayName || author?.identity.name || "故事网友"}: ${candidate.content}`,
      storyVersion: story.version,
      occurredAt: now,
      createdAt: now,
      ...(author ? { actorIds: [author.id] } : {}),
      forumThreadId: thread.id,
      forumReplyId: replyId,
      floorNumber: reply.floorNumber ?? reply.floor,
      idempotencyKey: `${storyId}:comment:${fingerprint(candidate.content)}`,
    };
    const eventWrite = StoryEventRepository.appendEvent(eventInput);
    ensureWrite(eventWrite, "comment event");
    if (!eventWrite.event) throw new Error("ForumStory comment event read failed");
    const event = eventWrite.event;
    replyResults.push(reply);
    eventResults.push(event);
    existingBodies.add(bodyKey);
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
