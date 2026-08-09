import { apiChat } from "../../../utils/apiHelper";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import type {
  ForumStory,
  StoryCharacter,
  StoryEvent,
  StoryEventInput,
  StoryThread,
  StoryUpdate,
  StoryUpdateTriggerReason,
} from "../../../domain/forumStory/forumStoryTypes";
import type {
  ForumStoryUpdateCandidate,
  ForumStoryUpdatePrompt,
} from "../../characterCognitive/promptAdapters/forumStoryUpdatePromptAdapter";
import {
  buildForumStoryUpdatePrompt,
  parseForumStoryUpdateCandidate,
} from "../../characterCognitive/promptAdapters/forumStoryUpdatePromptAdapter";
import { ForumStoryRepository } from "../forumStoryRepository";
import { StoryCharacterRepository } from "../storyCharacterRepository";
import { StoryEventRepository } from "../storyEventRepository";
import { StoryForumReplyRepository } from "../storyReplyRepository";
import { StoryThreadRepository } from "../storyThreadRepository";
import { StoryUpdateRepository } from "../storyUpdateRepository";
import { validateForumStoryUpdateCandidate } from "../validators/forumStoryOutputValidator";
import type { StorageWriteResult } from "../../../core/storage/storageTypes";

export interface ForumStoryUpdateGenerationSettings {
  apiKey: string;
  selectedModel: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}

export interface ForumStoryUpdateAiRequest {
  message: string;
  systemInstruction: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}

export type ForumStoryUpdateAiCall = (request: ForumStoryUpdateAiRequest) => Promise<{ text: string }>;

export interface GenerateForumStoryUpdateInput {
  storyId?: string;
  story?: ForumStory;
  thread?: StoryThread;
  storyThread?: StoryThread;
  characters?: readonly StoryCharacter[];
  storyCharacters?: readonly StoryCharacter[];
  settings: ForumStoryUpdateGenerationSettings;
  triggerReason?: StoryUpdateTriggerReason;
  /** Explicit story-scope request to write the concluding episode. */
  conclude?: boolean;
  now?: number;
  aiCall?: ForumStoryUpdateAiCall;
}

export interface ForumStoryUpdateGenerationResult {
  story: ForumStory;
  thread: StoryThread;
  characters: readonly StoryCharacter[];
  update: StoryUpdate;
  event: StoryEvent;
  candidate: ForumStoryUpdateCandidate;
  prompt: ForumStoryUpdatePrompt;
}

const ensureWrite = (result: StorageWriteResult, label: string): void => {
  if (!result.success) throw new Error(`ForumStory ${label} save failed`);
};

const defaultAiCall: ForumStoryUpdateAiCall = (request) => apiChat({ ...request, ...PromptComposer.compose({ scenario: "forum-story-update", message: request.message, history: [], systemInstruction: request.systemInstruction }) });

const generateCandidate = async (input: {
  prompt: ForumStoryUpdatePrompt;
  settings: ForumStoryUpdateGenerationSettings;
  aiCall: ForumStoryUpdateAiCall;
}): Promise<ForumStoryUpdateCandidate> => {
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
      return parseForumStoryUpdateCandidate(response.text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ForumStory update generation failed");
};

const selectThread = (input: GenerateForumStoryUpdateInput, storyId: string): StoryThread => {
  const thread = input.thread || input.storyThread;
  if (!thread) throw new Error("ForumStory update generation requires a StoryThread");
  if (thread.storyId !== storyId) throw new Error("StoryThread scope mismatch");
  if (thread.status !== "open") throw new Error("StoryThread is closed");
  return thread;
};

const selectCharacters = (input: GenerateForumStoryUpdateInput, storyId: string): StoryCharacter[] => {
  const persisted = StoryCharacterRepository.getStoryCharactersByStoryId(storyId);
  if (persisted.length > 0) return persisted.filter((character) => character.status === "active");
  const characters = (input.characters || input.storyCharacters || [])
    .filter((character) => character.storyId === storyId && character.status === "active");
  if (characters.length === 0) throw new Error("ForumStory update requires story-scoped characters");
  return [...characters];
};

const storyAuthor = (characters: readonly StoryCharacter[]): StoryCharacter | undefined =>
  characters.find((character) => character.isAuthor) || characters[0];

/**
 * Generates one manual public continuation and appends one immutable
 * update_published event. No scheduler, UI projection, or private context is
 * consulted by this service.
 */
export const generateStoryUpdate = async (
  input: GenerateForumStoryUpdateInput,
): Promise<ForumStoryUpdateGenerationResult> => {
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
  const events = StoryEventRepository.listEvents(storyId);
  if (events.length === 0) throw new Error("ForumStory update requires a public event timeline");
  const comments = StoryForumReplyRepository.listReplies(storyId, thread.id);
  const prompt = buildForumStoryUpdatePrompt({
    storyScope: "forum-story",
    story: {
      title: story.title,
      premise: story.premise,
      status: story.status,
      currentEpisode: story.currentEpisode,
    },
    thread: { title: thread.title, initialContent: thread.initialContent },
    characters: characters.map((character) => ({
      name: character.identity.name,
      role: character.role,
      personaSummary: character.personaSummary,
    })),
    events: events.map((event) => ({
      type: event.type,
      sequence: event.sequence,
      summary: event.summary,
    })),
    comments: comments.map((reply) => ({
      authorName: reply.publicAuthor.displayName,
      content: reply.body,
    })),
    conclude: input.conclude === true,
  });
  const parsedCandidate = await generateCandidate({
    prompt,
    settings: input.settings,
    aiCall: input.aiCall || defaultAiCall,
  });
  const validation = validateForumStoryUpdateCandidate(parsedCandidate, {
    storyId,
    storyCharacterIds: characters.map((character) => character.id),
    storyThreadIds: [thread.id],
    storyEventIds: events.map((event) => event.id),
  });
  if (!validation.allowed || !validation.sanitizedData) {
    throw new Error(`ForumStory update output rejected: ${validation.rejectedReasons.join("; ")}`);
  }
  const candidate = validation.sanitizedData;

  const now = input.now ?? Date.now();
  const nextEpisode = story.currentEpisode + 1;
  const updateId = `${storyId}:update:${nextEpisode}`;
  const eventId = `${storyId}:event:update-published:${nextEpisode}`;
  const idempotencyKey = `${storyId}:update-published:${nextEpisode}`;
  if (StoryUpdateRepository.listUpdates(storyId).some((update) => update.id === updateId)) {
    throw new Error("ForumStory update already exists for this episode");
  }
  if (events.some((event) => event.id === eventId || event.idempotencyKey === idempotencyKey)) {
    throw new Error("ForumStory update event already exists for this episode");
  }

  const author = storyAuthor(characters);
  const eventInput: StoryEventInput = {
    id: eventId,
    storyId,
    type: "update_published",
    source: author ? "npc" : "system",
    status: "confirmed",
    summary: candidate.eventProgression,
    storyVersion: story.version,
    occurredAt: now,
    createdAt: now,
    ...(author ? { actorIds: [author.id] } : {}),
    forumThreadId: thread.id,
    idempotencyKey,
  };
  const update: StoryUpdate = {
    id: updateId,
    storyId,
    ...(candidate.title ? { title: candidate.title } : {}),
    updatedAt: now,
    content: candidate.content,
    eventProgression: candidate.eventProgression,
    triggerReason: input.triggerReason || "manual",
    status: "published",
    eventIds: [eventId],
    createdAt: now,
  };

  ensureWrite(StoryUpdateRepository.appendUpdate(update), "update");
  const eventWrite = StoryEventRepository.appendEvent(eventInput);
  ensureWrite(eventWrite, "update event");
  if (!eventWrite.event) throw new Error("ForumStory update event read failed");
  const event = eventWrite.event;
  if (input.conclude) {
    const completionWrite = StoryEventRepository.appendEvent({
      id: `${storyId}:event:story-completed:${nextEpisode}`,
      storyId,
      type: "story_completed",
      source: author ? "npc" : "system",
      status: "confirmed",
      summary: `故事完结：${candidate.eventProgression}`,
      storyVersion: story.version + 1,
      occurredAt: now,
      createdAt: now,
      ...(author ? { actorIds: [author.id] } : {}),
      forumThreadId: thread.id,
      idempotencyKey: `${storyId}:story-completed:${nextEpisode}`,
    });
    ensureWrite(completionWrite, "completion event");
  }
  ensureWrite(ForumStoryRepository.updateStory(storyId, {
    status: input.conclude ? "completed" : "waiting_update",
    currentEpisode: nextEpisode,
    currentStoryTime: now,
    updatedAt: now,
    ...(input.conclude ? { completedAt: now } : {}),
    version: story.version + 1,
  }), "story state");
  const updatedStory = ForumStoryRepository.getStory(storyId);
  if (!updatedStory) throw new Error("ForumStory state read failed after update");

  return {
    story: updatedStory,
    thread,
    characters,
    update,
    event,
    candidate,
    prompt,
  };
};

export const ForumStoryUpdateService = {
  generateStoryUpdate,
};

export const forumStoryUpdateService = ForumStoryUpdateService;
