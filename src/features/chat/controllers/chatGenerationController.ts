import type { Character, UserSettings } from "../../../types";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import type { PromptContext } from "../../../domain/prompt/promptTypes";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import type { AppointmentMode } from "../../../domain/schedule/scheduleTypes";
import { apiChat } from "../../../utils/apiHelper";
import { requestAiReply } from "../services/aiReplyService";
import { generateGroupReplyCandidates } from "../services/groupChatService";
import { generateProactiveReplyCandidates } from "../services/proactiveMessageService";
import { createRegeneratedReplyCandidates } from "../services/regenerateService";
import type { AiChatRequest, ReplyCandidateContext } from "../services/chatServiceTypes";
import { buildTextAiRuntimeConfig } from "../services/textAiRuntimeConfig";
import { CHAT_DEGENERATE_RETRY_INSTRUCTION, isDegenerateDirectReply, removeDegenerateReplyPattern } from "../services/chatEchoGuard";
import { CHAT_RESPONSE_FORMAT_RETRY_INSTRUCTION, parseChatTurnResponse } from "../services/chatTurnResponseProtocol";
import type { ParsedAiChatResponse } from "../services/chatServiceTypes";

type PromptInput = Pick<PromptContext, "scenario" | "message" | "history" | "systemInstruction" | "imageDataUrl" | "historyInjections">;
type RequestAi = typeof apiChat;

export function buildComposedAiChatRequest(prompt: PromptInput, settings: UserSettings): AiChatRequest {
  return { ...PromptComposer.compose(prompt), ...buildTextAiRuntimeConfig(settings) };
}

type NormalizedDirectChatResponse = ParsedAiChatResponse & { formatIssue?: "invalid-structured-response" };

const normalizeDirectChatResponse = (raw: ParsedAiChatResponse, includeInnerVoice: boolean): NormalizedDirectChatResponse => {
  if (!includeInnerVoice) return raw;
  const parsed = parseChatTurnResponse(raw.text);
  return {
    ...raw,
    text: parsed.reply,
    translation: parsed.translation,
    innerVoice: parsed.innerVoice,
    formatIssue: parsed.formatIssue,
  };
};

const requestDirectChatResponse = async (input: {
  requestAi: RequestAi;
  request: AiChatRequest;
  includeInnerVoice?: boolean;
}): Promise<NormalizedDirectChatResponse> => {
  const first = normalizeDirectChatResponse(
    await requestAiReply(input.requestAi, input.request),
    Boolean(input.includeInnerVoice),
  );
  if (!first.formatIssue) return first;

  const retryRaw = await requestAiReply(input.requestAi, {
    ...input.request,
    systemInstruction: [input.request.systemInstruction, CHAT_RESPONSE_FORMAT_RETRY_INSTRUCTION]
      .filter(Boolean)
      .join("\n\n"),
  });
  const retry = normalizeDirectChatResponse(retryRaw, true);
  if (!retry.formatIssue && retry.text.trim()) return retry;

  throw new Error("模型回复格式异常：重试后仍未得到有效文字回复。请更换模型或重试。");
};

export async function requestDirectChatTurn(input: { prompt: PromptInput; settings: UserSettings; requestAi?: RequestAi; signal?: AbortSignal; includeInnerVoice?: boolean }): Promise<ParsedAiChatResponse> {
  const requestAi = input.requestAi || apiChat;
  const request = { ...buildComposedAiChatRequest(input.prompt, input.settings), signal: input.signal };
  const first = await requestDirectChatResponse({ requestAi, request, includeInnerVoice: input.includeInnerVoice });
  if (!isDegenerateDirectReply(input.prompt.message, first.text, request.history)) return first;
  const retryHistory = removeDegenerateReplyPattern(request.history, first.text);
  const retry = await requestDirectChatResponse({
    requestAi,
    request: {
      ...request,
      history: retryHistory,
      systemInstruction: [request.systemInstruction, CHAT_DEGENERATE_RETRY_INSTRUCTION].filter(Boolean).join("\n\n"),
    },
    includeInnerVoice: input.includeInnerVoice,
  });
  if (!retry.text.trim() || isDegenerateDirectReply(input.prompt.message, retry.text, request.history)) {
    throw new Error("模型连续返回重复或无意义的回复，本次回复已停止写入，请重试。");
  }
  return retry;
}

export function generateGroupChatTurn(input: {
  prompt: PromptInput; settings: UserSettings; members: readonly Character[]; groupId: string;
  disableBracketActions: boolean; createId: (index: number) => string; currentTime: () => number; requestAi?: RequestAi; signal?: AbortSignal;
}) {
  return generateGroupReplyCandidates({
    requestAi: input.requestAi || apiChat,
    request: { ...buildComposedAiChatRequest(input.prompt, input.settings), signal: input.signal },
    members: input.members,
    groupId: input.groupId,
    disableBracketActions: input.disableBracketActions,
    createId: input.createId,
    currentTime: input.currentTime,
  });
}

export async function generateRegeneratedChatTurn(input: {
  prompt: PromptInput; settings: UserSettings; candidateContext: Omit<ReplyCandidateContext, "rawText">; requestAi?: RequestAi;
}) {
  const data = await requestAiReply(input.requestAi || apiChat, buildComposedAiChatRequest(input.prompt, input.settings));
  return { data, candidates: data?.text ? createRegeneratedReplyCandidates({ ...input.candidateContext, rawText: data.text }) : null };
}

export function generateProactiveChatTurn(input: {
  prompt: PromptInput; settings: UserSettings; characterId: string; disableBracketActions: boolean;
  keepPeriods: boolean; createId: (index: number) => string; currentTime: (index: number) => number;
  transformBubble?: (bubbleText: string, index: number) => string; cognitiveContext?: CharacterCognitiveContext; requestAi?: RequestAi;
  proactiveOfflineAllowedModes?: readonly AppointmentMode[]; directiveNow?: number;
}) {
  return generateProactiveReplyCandidates({
    requestAi: input.requestAi || apiChat,
    request: buildComposedAiChatRequest(input.prompt, input.settings),
    characterId: input.characterId,
    disableBracketActions: input.disableBracketActions,
    keepPeriods: input.keepPeriods,
    createId: input.createId,
    currentTime: input.currentTime,
    transformBubble: input.transformBubble,
    proactiveOfflineAllowedModes: input.proactiveOfflineAllowedModes,
    directiveNow: input.directiveNow,
    cognitiveContext: input.cognitiveContext,
  });
}
