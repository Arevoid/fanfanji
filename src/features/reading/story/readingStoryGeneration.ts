import { apiChat } from "../../../utils/apiHelper";
import type { ReadingStoryState } from "../../../domain/reading/storyTypes";
import { commitReadingStoryTurn, validateReadingStoryTurnResult, type ReadingStoryTurnResult } from "./readingStory";
import { buildReadingStoryPrompt } from "./readingStoryPrompt";
import { listReadingStoryTurns } from "../../../core/storage/repositories/readingStoryRepository";

export interface ReadingStoryGenerationSettings { apiKey: string; selectedModel: string; apiEndpoint?: string; apiTemperature?: number; streamCompatible?: boolean; }
export interface ReadingStoryAiRequest { message: string; systemInstruction: string; apiKey: string; model: string; apiEndpoint?: string; apiTemperature?: number; streamCompatible?: boolean; }
export type ReadingStoryAiCall = (request: ReadingStoryAiRequest) => Promise<{ text: string }>;

const defaultAiCall: ReadingStoryAiCall = (request) => apiChat({ ...request, history: [] });
const parseJson = (raw: string): unknown => {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf("{"); const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("故事 AI 返回不是有效 JSON");
  }
};

export async function generateReadingStoryTurn(input: { story: ReadingStoryState; userAction: string; bookTitle?: string; settings: ReadingStoryGenerationSettings; aiCall?: ReadingStoryAiCall; now?: number }): Promise<{ story: ReadingStoryState; result: ReadingStoryTurnResult }> {
  if (!input.userAction.trim()) throw new Error("请先输入或选择一个行动");
  if (!input.settings.apiKey?.trim() || !input.settings.selectedModel?.trim()) throw new Error("穿书 AI 配置不完整，请先设置 API Key 和模型");
  const turns = listReadingStoryTurns({ userIdentityId: input.story.userIdentityId, storyId: input.story.storyId });
  const prompt = buildReadingStoryPrompt({ story: input.story, recentTurns: turns, userAction: input.userAction, bookTitle: input.bookTitle });
  const call = input.aiCall || defaultAiCall;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await call({ message: prompt.message, systemInstruction: attempt === 0 ? prompt.systemInstruction : `${prompt.systemInstruction}\n上一次返回未通过结构校验，请只输出符合 schema 的 JSON。`, apiKey: input.settings.apiKey, model: input.settings.selectedModel, apiEndpoint: input.settings.apiEndpoint, apiTemperature: input.settings.apiTemperature, streamCompatible: input.settings.streamCompatible });
      const result = validateReadingStoryTurnResult(parseJson(response.text));
      const committed = commitReadingStoryTurn({ scope: { userIdentityId: input.story.userIdentityId, storyId: input.story.storyId }, result, userAction: input.userAction, now: input.now });
      return { story: committed.story, result };
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("故事回合生成失败");
}
