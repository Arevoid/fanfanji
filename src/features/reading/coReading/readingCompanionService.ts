import type { Character, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { ReadingRoom } from "../../../domain/reading/coReadingTypes";
import type { ReadingParagraphView } from "../reader/readingReader";
import { apiChat } from "../../../utils/apiHelper";
import { buildAiReadingContext } from "./aiReadingBoundary";
import { buildReadingPromptProjection, type ReadingPromptDiscussionMessage } from "./readingPromptAdapter";
import { validateReadingAiResponse, type ReadingAiResponse, type ReadingAiResponseKind } from "./readingAiResponseProtocol";

export interface ReadingCompanionRequest {
  room: ReadingRoom;
  character: Character;
  relationship: CharacterRelationship;
  settings: UserSettings;
  paragraph: ReadingParagraphView;
  kind: Extract<ReadingAiResponseKind, "comment" | "discussion_reply">;
  userPrompt?: string;
  recentMessages?: readonly ReadingPromptDiscussionMessage[];
  autonomous?: boolean;
  worldBookContext?: string;
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 没有返回可校验的共读回复");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function requestReadingCompanionResponse(input: ReadingCompanionRequest): Promise<ReadingAiResponse | undefined> {
  if (!input.settings.apiKey || !input.settings.selectedModel) throw new Error("请先配置 API 和模型，才能让好友参与共读讨论");
  const fragment = { anchor: input.paragraph.anchor, textSnapshot: input.paragraph.text };
  const aiContext = buildAiReadingContext(input.room, [fragment]);
  const projection = buildReadingPromptProjection({
    character: input.character,
    relationship: input.relationship,
    room: input.room,
    aiContext,
    currentFragment: fragment,
    discussion: input.userPrompt ? { userPrompt: input.userPrompt, recentMessages: input.recentMessages } : undefined,
    roomGuidance: input.autonomous
      ? "只有当这段内容确实符合你的关注点、价值判断或表达习惯时才评论；不感兴趣就只返回 SKIP。评论应像真实共读者的即时段评，可表达联想、疑问、喜恶或对细节的观察。"
      : "围绕用户当前问题和正文片段直接回应。可以表达观点、提出疑问或接续讨论，但不得越过已读边界。",
  });
  const outputContract = [
    input.autonomous ? "如果没有想评论的内容，只输出 SKIP。" : "必须回应用户。",
    "body 必须是角色本人用第一人称对用户说的聊天内容，不要写角色自己的动作、表情或旁白。",
    "否则只输出一个 JSON 对象，不要 Markdown：",
    `{"kind":"${input.kind}","body":"自然的中文回复","targetParagraphAnchorId":"${input.paragraph.anchor.id}","source":"known","isSpoiler":false}`,
  ].join("\n");
  const baseSystemInstruction = input.worldBookContext?.trim()
    ? `${projection.system}\n【当前关系可见的世界书】\n${input.worldBookContext.trim().slice(0, 12000)}`
    : projection.system;
  let lastError: unknown;
  // A transient provider failure or one malformed JSON response should not
  // leave a persisted user message without its single expected reply.
  // Retry the request once; no message is persisted until validation passes.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await apiChat({
        message: `${projection.user}\n\n【本轮输出要求】\n${outputContract}${attempt > 0 ? "\n上一次输出未通过校验，请重新生成符合格式的直接回复。" : ""}`,
        history: [],
        systemInstruction: baseSystemInstruction,
        apiKey: input.settings.apiKey,
        model: input.settings.selectedModel,
        apiEndpoint: input.settings.apiEndpoint,
        apiTemperature: input.settings.apiTemperature,
        streamCompatible: input.settings.streamCompatible,
      });
      if (input.autonomous && /^\s*SKIP[。.!！]?\s*$/i.test(response.text)) return undefined;
      const validation = validateReadingAiResponse(parseJsonObject(response.text), { scope: input.room, projection: aiContext, kind: input.kind });
      if ("error" in validation) throw new Error(validation.error);
      return validation.value;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("实时共读回复失败，请稍后重试");
}
