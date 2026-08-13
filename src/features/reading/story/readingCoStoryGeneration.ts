import { apiChat } from "../../../utils/apiHelper";
import type { ReadingCoStoryActionMode, ReadingCoStoryState, ReadingStoryAiActionResult } from "../../../domain/reading/coStoryTypes";
import { getReadingCoStory, listReadingCoStoryTurns } from "../../../core/storage/repositories/readingCoStoryRepository";
import { buildReadingCoStoryAiActionPrompt, projectReadingCoStoryForAi } from "./readingCoStoryPrompt";
import { commitReadingCoStoryAiAction } from "./readingCoStory";
import { ReadingCoStoryPolicyError, validateReadingStoryAiAction } from "./readingCoStoryPolicy";

export interface ReadingCoStoryGenerationSettings { apiKey: string; selectedModel: string; apiEndpoint?: string; apiTemperature?: number; streamCompatible?: boolean; }
export interface ReadingCoStoryAiRequest { message: string; systemInstruction: string; apiKey: string; model: string; apiEndpoint?: string; apiTemperature?: number; streamCompatible?: boolean; }
export type ReadingCoStoryAiCall = (request: ReadingCoStoryAiRequest) => Promise<{ text: string }>;
const defaultAiCall: ReadingCoStoryAiCall = (request) => apiChat({ ...request, history: [] });

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
  if (!input.settings.apiKey?.trim() || !input.settings.selectedModel?.trim()) throw new Error("共同穿书 AI 配置不完整，请先设置 API Key 和模型");
  const scope = { userIdentityId: input.story.userIdentityId, coStoryId: input.story.coStoryId, relationId: input.story.relationId, characterId: input.story.characterId };
  const current = getReadingCoStory(scope);
  if (!current) throw new Error("共同故事不存在");
  const context = projectReadingCoStoryForAi({ story: current, turns: listReadingCoStoryTurns(scope) });
  const prompt = buildReadingCoStoryAiActionPrompt({ context, mode: input.mode, userRequest: input.userRequest });
  const call = input.aiCall || defaultAiCall;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await call({ message: prompt.message, systemInstruction: attempt === 0 ? prompt.systemInstruction : `${prompt.systemInstruction}\n上一次输出未通过校验，请只输出符合 schema 的 JSON。`, apiKey: input.settings.apiKey, model: input.settings.selectedModel, apiEndpoint: input.settings.apiEndpoint, apiTemperature: input.settings.apiTemperature, streamCompatible: input.settings.streamCompatible });
      const result = validateReadingStoryAiAction(parseJson(response.text));
      const committed = commitReadingCoStoryAiAction({ scope, result, mode: input.mode, expectedStoryUpdatedAt: current.updatedAt, now: input.now });
      return { story: committed.story, result, attempts: attempt + 1 };
    } catch (error) {
      if ((error instanceof ReadingCoStoryPolicyError && error.code === "forbidden") || (error && typeof error === "object" && "code" in error && ["conflict", "storage", "missing"].includes(String((error as { code?: string }).code)))) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI 好友行动生成失败");
}
