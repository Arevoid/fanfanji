import { apiChat } from "../../../utils/apiHelper";
import type {
  ReadingStoryState,
  ReadingStoryTurn,
} from "../../../domain/reading/storyTypes";
import {
  commitReadingStoryTurn,
  getReadingStory,
  listReadingStoryTurns,
  validateReadingStoryTurnResult,
  type ReadingStoryTurnResult,
} from "./readingStory";
import { buildReadingStoryPrompt } from "./readingStoryPrompt";

export interface ReadingStoryGenerationSettings {
  apiKey: string;
  selectedModel: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}
export interface ReadingStoryAiRequest {
  message: string;
  systemInstruction: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}
export type ReadingStoryAiCall = (
  request: ReadingStoryAiRequest,
) => Promise<{ text: string }>;
const defaultAiCall: ReadingStoryAiCall = (request) =>
  apiChat({ ...request, history: [] });

const parseJson = (raw: string): unknown => {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start)
      return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Story AI response is not valid JSON");
  }
};

const resultFromTurn = (turn: ReadingStoryTurn): ReadingStoryTurnResult => ({
  narrative: turn.narrative,
  dialogue: turn.dialogue,
  choices: turn.choices,
  stateChanges: turn.stateChanges,
  discoveredIntel: turn.discoveredIntel,
  taskChanges: turn.taskChanges,
  relationshipChanges: turn.relationshipChanges,
  currentLocation: turn.currentLocation,
  currentTime: turn.currentTime,
  chapterProgress: turn.chapterProgress,
  shouldEndChapter: turn.shouldEndChapter,
});

export async function generateReadingStoryTurn(input: {
  story: ReadingStoryState;
  userAction: string;
  bookTitle?: string;
  bookContext?: string;
  settings: ReadingStoryGenerationSettings;
  aiCall?: ReadingStoryAiCall;
  requestId?: string;
  now?: number;
}): Promise<{
  story: ReadingStoryState;
  result: ReadingStoryTurnResult;
  requestId?: string;
  attempts: number;
}> {
  if (!input.userAction.trim())
    throw new Error("Please enter or choose an action first");
  if (!input.settings.apiKey?.trim() || !input.settings.selectedModel?.trim())
    throw new Error("穿书 AI 配置不完整，请先设置 API Key 和模型");
  const scope = {
    userIdentityId: input.story.userIdentityId,
    storyId: input.story.storyId,
  };
  const requestId = input.requestId?.trim() || undefined;
  const turns = listReadingStoryTurns(scope);
  // A retried submit with the same request key returns the already committed
  // turn without spending another model request.
  if (requestId) {
    const existing = turns.find((turn) => turn.requestId === requestId);
    if (existing) {
      const currentStory = getReadingStory(scope);
      if (!currentStory) throw new Error("Story does not exist");
      return {
        story: currentStory,
        result: resultFromTurn(existing),
        requestId,
        attempts: 0,
      };
    }
  }
  const prompt = buildReadingStoryPrompt({
    story: input.story,
    recentTurns: turns,
    userAction: input.userAction,
    bookTitle: input.bookTitle,
    bookContext: input.bookContext,
  });
  const call = input.aiCall || defaultAiCall;
  let lastError: unknown;
  let attempts = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    attempts += 1;
    try {
      const response = await call({
        message: prompt.message,
        systemInstruction:
          attempt === 0
            ? prompt.systemInstruction
            : `${prompt.systemInstruction}\nThe previous response failed validation. Output only JSON matching the schema.`,
        apiKey: input.settings.apiKey,
        model: input.settings.selectedModel,
        apiEndpoint: input.settings.apiEndpoint,
        apiTemperature: input.settings.apiTemperature,
        streamCompatible: input.settings.streamCompatible,
      });
      const result = validateReadingStoryTurnResult(parseJson(response.text));
      // Do not retry commit errors: a conflict or storage failure needs to be
      // surfaced to the UI, and retrying would risk producing a second branch.
      const committed = commitReadingStoryTurn({
        scope,
        result,
        userAction: input.userAction,
        requestId,
        expectedStoryUpdatedAt: input.story.updatedAt,
        now: input.now,
      });
      return { story: committed.story, result, requestId, attempts };
    } catch (error) {
      // ReadingStoryError with a conflict/storage code is a persistence error,
      // not an AI formatting error. Let it fail immediately.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ((error as { code?: string }).code === "conflict" ||
          (error as { code?: string }).code === "storage" ||
          (error as { code?: string }).code === "missing")
      )
        throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Story turn generation failed");
}
