import { ensureDistinctReadingStoryChoices } from "./readingStoryChoices";
import { requireReadingStorySourceCursor, loadReadingStorySourceContext, describeReadingStorySourceContext, applyReadingStorySourceUpdate } from "./readingStorySource";
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
  apiChat({ ...request, history: [], purpose: "reading_generate", singleAttempt: true, responseFormat: "json_object" });

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
  sourceUpdate: turn.sourceUpdate,
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
  const currentStory = getReadingStory(scope);
  if (!currentStory || currentStory.updatedAt !== input.story.updatedAt) throw new Error("故事已变化，请刷新后重试");
  const originalSource = await loadReadingStorySourceContext(input.story.userIdentityId, input.story.bookId, input.story.sourceContinuity);
  if (input.story.bookId && originalSource.status !== "ready") throw new Error("请先在原著定位中选择有效章节和段落；原有剧情已保留，本次未调用 API。");
  const prompt = buildReadingStoryPrompt({
    story: input.story,
    recentTurns: turns,
    userAction: input.userAction,
    bookTitle: input.bookTitle,
    bookContext: input.bookContext,
    originalContext: describeReadingStorySourceContext(originalSource, input.story.sourceContinuity),
  });
  const call = input.aiCall || defaultAiCall;
  const response = await call({
    message: prompt.message,
    systemInstruction: prompt.systemInstruction,
    apiKey: input.settings.apiKey,
    model: input.settings.selectedModel,
    apiEndpoint: input.settings.apiEndpoint,
    apiTemperature: input.settings.apiTemperature,
    streamCompatible: input.settings.streamCompatible,
  });
  const result = validateReadingStoryTurnResult(parseJson(response.text));
  // Do not retry commit errors: a conflict or storage failure needs to be
  // surfaced to the UI, and retrying would risk producing a second branch.
  result.choices = ensureDistinctReadingStoryChoices(result.choices, { previousChoices: turns.at(-1)?.choices.map(choice => choice.label) });
  const nextContinuity = applyReadingStorySourceUpdate(input.story.sourceContinuity, originalSource, result.sourceUpdate);
  if (nextContinuity === input.story.sourceContinuity) result.sourceUpdate = undefined;
  if (input.story.bookId && input.story.sourceContinuity) requireReadingStorySourceCursor(input.story.userIdentityId, input.story.bookId, input.story.sourceContinuity.cursor);
  const committed = commitReadingStoryTurn({
    scope,
    result,
    userAction: input.userAction,
    requestId,
    expectedStoryUpdatedAt: input.story.updatedAt,
    sourceContinuity: nextContinuity,
    now: input.now,
  });
  return { story: committed.story, result, requestId, attempts: 1 };
}
