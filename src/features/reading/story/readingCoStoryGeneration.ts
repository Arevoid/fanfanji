import { ensureDistinctReadingStoryChoices } from "./readingStoryChoices";
import { requireReadingStorySourceCursor, loadReadingStorySourceContext, describeReadingStorySourceContext, applyReadingStorySourceUpdate } from "./readingStorySource";
import { resolveCharacterTextSettings } from "../../../domain/character/characterTextApiRouting";
import { apiChat } from "../../../utils/apiHelper";
import type { ReadingCoStoryActionMode, ReadingCoStoryState, ReadingStoryAiActionResult } from "../../../domain/reading/coStoryTypes";
import { getReadingCoStory, listReadingCoStoryTurns } from "../../../core/storage/repositories/readingCoStoryRepository";
import { buildReadingCoStoryAiActionPrompt, buildReadingCoStoryTurnPrompt, projectReadingCoStoryForAi } from "./readingCoStoryPrompt";
import { commitReadingCoStoryAiAction, commitReadingCoStoryTurn, ReadingCoStoryError, validateReadingCoStoryTurnResult, type ReadingCoStoryTurnResult } from "./readingCoStory";
import { ReadingCoStoryPolicyError, validateReadingStoryAiAction } from "./readingCoStoryPolicy";

export interface ReadingCoStoryGenerationSettings { apiKey: string; selectedModel: string; apiEndpoint?: string; apiTemperature?: number; streamCompatible?: boolean; }
export interface ReadingCoStoryAiRequest { characterId?:string; message: string; systemInstruction: string; apiKey: string; model: string; apiEndpoint?: string; apiTemperature?: number; streamCompatible?: boolean; }
export type ReadingCoStoryAiCall = (request: ReadingCoStoryAiRequest) => Promise<{ text: string }>;
const defaultAiCall: ReadingCoStoryAiCall = (request) => apiChat({ ...request, history: [], purpose: "reading_generate", singleAttempt: true, responseFormat: "json_object" });

const parseJson = (raw: string): unknown => {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf("{"); const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("AI 好友返回不是有效 JSON");
  }
};

export async function generateReadingCoStoryAiAction(input: {
  story: ReadingCoStoryState;
  mode: ReadingCoStoryActionMode;
  userRequest?: string;
  settings: ReadingCoStoryGenerationSettings;
  aiCall?: ReadingCoStoryAiCall;
  now?: number;
}): Promise<{ story: ReadingCoStoryState; result: ReadingStoryAiActionResult; attempts: number }> {
  input = {...input,settings:resolveCharacterTextSettings(input.settings,undefined,input.story.characterId)};
  if (!input.settings.apiKey?.trim() || !input.settings.selectedModel?.trim()) throw new Error("共同穿书 AI 配置不完整，请先设置 API Key 和模型");
  const scope = { userIdentityId: input.story.userIdentityId, coStoryId: input.story.coStoryId, relationId: input.story.relationId, characterId: input.story.characterId };
  const current = getReadingCoStory(scope);
  if (!current) throw new Error("共同故事不存在");
  const context = projectReadingCoStoryForAi({ story: current, turns: listReadingCoStoryTurns(scope) });
  const prompt = buildReadingCoStoryAiActionPrompt({ context, mode: input.mode, userRequest: input.userRequest });
  const call = input.aiCall || defaultAiCall;
  const response = await call({ characterId:input.story.characterId, message: prompt.message, systemInstruction: prompt.systemInstruction, apiKey: input.settings.apiKey, model: input.settings.selectedModel, apiEndpoint: input.settings.apiEndpoint, apiTemperature: input.settings.apiTemperature, streamCompatible: input.settings.streamCompatible });
  const result = validateReadingStoryAiAction(parseJson(response.text));
  const committed = commitReadingCoStoryAiAction({ scope, result, mode: input.mode, expectedStoryUpdatedAt: current.updatedAt, now: input.now });
  return { story: committed.story, result, attempts: 1 };
}

const turnResultFromStored = (turn: ReturnType<typeof listReadingCoStoryTurns>[number]): ReadingCoStoryTurnResult => ({ sourceUpdate: turn.sourceUpdate, narrative: turn.narrative, dialogue: turn.dialogue, choices: turn.choices, friendAction: turn.aiAction || "", controlsUserCharacter: false, stateChanges: turn.stateChanges || [], userDiscoveredIntel: turn.userDiscoveredIntel || [], aiDiscoveredIntel: turn.aiDiscoveredIntel || [], taskChanges: [], inventoryChanges: [], currentLocation: turn.currentLocation || "", currentTime: turn.currentTime || "", chapterProgress: turn.chapterProgress || 0, shouldEndChapter: Boolean(turn.shouldEndChapter) });

export async function generateReadingCoStoryTurn(input: {
  story: ReadingCoStoryState;
  userAction: string;
  settings: ReadingCoStoryGenerationSettings;
  aiCall?: ReadingCoStoryAiCall;
  requestId?: string;
  now?: number;
}): Promise<{ story: ReadingCoStoryState; result: ReadingCoStoryTurnResult; requestId?: string; attempts: number }> {
  if (!input.userAction.trim()) throw new ReadingCoStoryError("请先输入或选择行动", "invalid");
  input = {...input,settings:resolveCharacterTextSettings(input.settings,undefined,input.story.characterId)};
  if (!input.settings.apiKey?.trim() || !input.settings.selectedModel?.trim()) throw new ReadingCoStoryError("共同故事 AI 配置不完整，请先设置 API Key 和模型", "invalid");
  const scope = { userIdentityId: input.story.userIdentityId, coStoryId: input.story.coStoryId, relationId: input.story.relationId, characterId: input.story.characterId };
  const current = getReadingCoStory(scope);
  if (!current) throw new ReadingCoStoryError("共同故事不存在", "missing");
  const turns = listReadingCoStoryTurns(scope);
  const requestId = input.requestId?.trim() || undefined;
  const existing = requestId ? turns.find((turn) => turn.requestId === requestId) : undefined;
  if (existing) return { story: current, result: turnResultFromStored(existing), requestId, attempts: 0 };
  if (current.updatedAt !== input.story.updatedAt) throw new ReadingCoStoryError("共同故事已变化，请刷新后重试", "conflict");
  const bookId = current.origin === "custom" ? undefined : current.universeStoryId;
  const originalSource = await loadReadingStorySourceContext(current.userIdentityId, bookId, current.sourceContinuity);
  if (bookId && originalSource.status !== "ready") throw new ReadingCoStoryError("请先在原著定位中选择有效章节和段落；原有剧情已保留，本次未调用 API。", "invalid");
  const prompt = buildReadingCoStoryTurnPrompt({ story: current, turns, userAction: input.userAction, originalContext: describeReadingStorySourceContext(originalSource, current.sourceContinuity) });
  const call = input.aiCall || defaultAiCall;
  const response = await call({ characterId:input.story.characterId, message: prompt.message, systemInstruction: prompt.systemInstruction, apiKey: input.settings.apiKey, model: input.settings.selectedModel, apiEndpoint: input.settings.apiEndpoint, apiTemperature: input.settings.apiTemperature, streamCompatible: input.settings.streamCompatible });
  const result = validateReadingCoStoryTurnResult(parseJson(response.text));
  result.choices = ensureDistinctReadingStoryChoices(result.choices, { previousChoices: turns.at(-1)?.choices.map(choice => choice.label) });
  const nextContinuity = applyReadingStorySourceUpdate(current.sourceContinuity, originalSource, result.sourceUpdate);
  if (nextContinuity === current.sourceContinuity) result.sourceUpdate = undefined;
  if (bookId && current.sourceContinuity) requireReadingStorySourceCursor(current.userIdentityId, bookId, current.sourceContinuity.cursor);
  const committed = commitReadingCoStoryTurn({ sourceContinuity: nextContinuity, scope, result, userAction: input.userAction, requestId, expectedStoryUpdatedAt: current.updatedAt, now: input.now });
  return { story: committed.story, result, requestId, attempts: 1 };
}
