import { apiChat } from "../../../utils/apiHelper";
import type {
  ForumStory,
  StoryCharacter,
  StoryEvent,
  StoryEventInput,
  StoryThread,
} from "../../../domain/forumStory/forumStoryTypes";
import {
  buildForumStoryInitialPrompt,
  parseForumStoryInitialCandidate,
  type ForumStoryInitialCandidate,
  type ForumStoryPromptCharacter,
} from "../../characterCognitive/promptAdapters/forumStoryPromptAdapter";
import { ForumStoryRepository } from "../forumStoryRepository";
import { StoryCharacterRepository } from "../storyCharacterRepository";
import { StoryThreadRepository } from "../storyThreadRepository";
import { StoryEventRepository } from "../storyEventRepository";
import { validateForumStoryInitialCandidate } from "../validators/forumStoryOutputValidator";
import type { StorageWriteResult } from "../../../core/storage/storageTypes";

export interface ForumStoryGenerationSettings {
  apiKey: string;
  selectedModel: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}

export interface ForumStoryAiRequest {
  message: string;
  systemInstruction: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}

export type ForumStoryAiCall = (request: ForumStoryAiRequest) => Promise<{ text: string }>;

export interface CreateForumStoryInput {
  theme: string;
  settings: ForumStoryGenerationSettings;
  /** Optional public background explicitly supplied for this story. */
  worldBackground?: string;
  /** Optional story-scoped role seeds; these are not Character entities. */
  characters?: readonly ForumStoryPromptCharacter[];
  /** Origin of the story inside story scope; does not identify a real user. */
  creationSource?: ForumStory["creationSource"];
  narrativeOutcome?: ForumStory["narrativeOutcome"];
  storyId?: string;
  now?: number;
  aiCall?: ForumStoryAiCall;
}

export interface ForumStoryCreationResult {
  story: ForumStory;
  thread: StoryThread;
  characters: readonly StoryCharacter[];
  event: StoryEvent;
  candidate: ForumStoryInitialCandidate;
}

const makeId = (prefix: string): string => {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
};

const requireTextAiConfig = (settings: ForumStoryGenerationSettings): void => {
  if (!settings.apiKey?.trim() || !settings.selectedModel?.trim()) {
    throw new Error("论坛故事 AI 配置缺失：请先填写文本 API Key 并选择模型。");
  }
};

const defaultAiCall: ForumStoryAiCall = (request) => apiChat({ ...request, history: [] });

const generateInitialCandidate = async (input: {
  prompt: { systemInstruction: string; message: string };
  settings: ForumStoryGenerationSettings;
  aiCall: ForumStoryAiCall;
}): Promise<ForumStoryInitialCandidate> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await input.aiCall({
        message: input.prompt.message,
        systemInstruction: attempt === 0
          ? input.prompt.systemInstruction
          : `${input.prompt.systemInstruction}\n\n上一次候选未通过格式或公开安全校验，请重新只输出符合 schema 的 JSON。`,
        apiKey: input.settings.apiKey,
        model: input.settings.selectedModel,
        apiEndpoint: input.settings.apiEndpoint,
        apiTemperature: input.settings.apiTemperature,
        streamCompatible: input.settings.streamCompatible,
      });
      return parseForumStoryInitialCandidate(response.text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("论坛故事初始内容生成失败");
};

const buildStoryCharacters = (input: {
  storyId: string;
  candidate: ForumStoryInitialCandidate;
  now: number;
}): StoryCharacter[] => input.candidate.characters.map((character, index) => ({
  id: `${input.storyId}:character:${index + 1}`,
  storyId: input.storyId,
  identity: {
    name: character.name,
    actorKey: `${input.storyId}:actor:${index + 1}`,
  },
  role: character.role,
  personaSummary: character.personaSummary,
  knowledgeScope: [],
  isAuthor: character.name === input.candidate.author.name,
  status: "active",
  createdAt: input.now,
  updatedAt: input.now,
}));

const ensureWrite = (result: StorageWriteResult, label: string): void => {
  if (!result.success) throw new Error(`论坛故事${label}保存失败`);
};

/**
 * Creates one story, one main StoryThread, story-scoped characters (persisted
 * in their isolated repository and returned by the generation result), and the
 * immutable post_created event. No Forum UI or existing ForumThread write is
 * performed in this phase.
 */
export const createForumStory = async (input: CreateForumStoryInput): Promise<ForumStoryCreationResult> => {
  const theme = input.theme.trim().slice(0, 500);
  if (!theme) throw new Error("论坛故事主题不能为空");
  const now = input.now ?? Date.now();
  const storyId = input.storyId?.trim() || makeId("forum-story");
  if (ForumStoryRepository.getStory(storyId)) throw new Error("论坛故事已存在");
  if (!input.aiCall) requireTextAiConfig(input.settings);

  const draftStory: ForumStory = {
    id: storyId,
    title: theme,
    seed: theme,
    premise: theme,
    status: "draft",
    creationSource: input.creationSource || "user",
    ...(input.narrativeOutcome ? { narrativeOutcome: input.narrativeOutcome } : {}),
    createdAt: now,
    updatedAt: now,
    currentEpisode: 1,
    version: 1,
  };
  ensureWrite(ForumStoryRepository.createStory(draftStory), "草稿");

  const prompt = buildForumStoryInitialPrompt({
    storyScope: "forum-story",
    theme,
    ...(input.worldBackground?.trim() ? { worldBackground: input.worldBackground.trim().slice(0, 1200) } : {}),
    ...(input.characters?.length ? { characters: input.characters.slice(0, 6) } : {}),
  });
  const parsedCandidate = await generateInitialCandidate({
    prompt,
    settings: input.settings,
    aiCall: input.aiCall || defaultAiCall,
  });
  const validation = validateForumStoryInitialCandidate(parsedCandidate, { storyId });
  if (!validation.allowed || !validation.sanitizedData) {
    throw new Error(`ForumStory initial output rejected: ${validation.rejectedReasons.join("; ")}`);
  }
  const candidate = validation.sanitizedData;

  const characters = buildStoryCharacters({ storyId, candidate, now });
  const author = characters.find((character) => character.isAuthor) || characters[0];
  if (!author) throw new Error("论坛故事初始内容缺少发帖身份");
  for (const character of characters) {
    ensureWrite(StoryCharacterRepository.createStoryCharacter(character), "角色");
  }

  const threadId = `${storyId}:thread:main`;
  const thread: StoryThread = {
    id: threadId,
    storyId,
    title: candidate.title,
    initialContent: candidate.body,
    status: "open",
    authorCharacterId: author.id,
    episode: 1,
    createdAt: now,
    updatedAt: now,
    viewCount: 0,
    likeCount: 0,
  };
  const eventInput: StoryEventInput = {
    id: `${storyId}:event:post-created`,
    storyId,
    type: "post_created",
    source: "system",
    status: "confirmed",
    summary: `${candidate.storyBackground} 当前状态：${candidate.initialState}`,
    storyVersion: draftStory.version,
    occurredAt: now,
    createdAt: now,
    actorIds: [author.id],
    idempotencyKey: `${storyId}:post-created`,
  };

  ensureWrite(StoryThreadRepository.createThread(thread), "主题");
  const eventWrite = StoryEventRepository.appendEvent(eventInput);
  ensureWrite(eventWrite, "初始事件");
  if (!eventWrite.event) throw new Error("ForumStory initial event read failed");
  const event = eventWrite.event;

  ensureWrite(ForumStoryRepository.updateStory(storyId, {
    title: candidate.title,
    premise: candidate.storyBackground,
    status: "active",
    updatedAt: now,
    startedAt: now,
    currentEpisode: 1,
    mainThreadId: threadId,
    currentStoryTime: now,
    version: 2,
  }), "主记录");
  const story = ForumStoryRepository.getStory(storyId);
  if (!story) throw new Error("论坛故事主记录读取失败");

  return { story, thread, characters, event, candidate };
};

export const ForumStoryGenerationService = {
  createForumStory,
};

export const forumStoryGenerationService = ForumStoryGenerationService;
