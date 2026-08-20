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
import { parseChatTurnResponse } from "../services/chatTurnResponseProtocol";
import type { ParsedAiChatResponse } from "../services/chatServiceTypes";

type PromptInput = Pick<PromptContext, "scenario" | "message" | "history" | "systemInstruction" | "historyInjections">;
type RequestAi = typeof apiChat;

export function buildComposedAiChatRequest(prompt: PromptInput, settings: UserSettings): AiChatRequest {
  return { ...PromptComposer.compose(prompt), ...buildTextAiRuntimeConfig(settings) };
}

export async function requestDirectChatTurn(input: { prompt: PromptInput; settings: UserSettings; requestAi?: RequestAi; signal?: AbortSignal; includeInnerVoice?: boolean }): Promise<ParsedAiChatResponse> {
  const requestAi = input.requestAi || apiChat;
  const request = { ...buildComposedAiChatRequest(input.prompt, input.settings), signal: input.signal };
  const firstRaw = await requestAiReply(requestAi, request);
  const firstParsed = input.includeInnerVoice ? parseChatTurnResponse(firstRaw.text) : { reply: firstRaw.text };
  const first = { ...firstRaw, text: firstParsed.reply, translation: firstParsed.translation, innerVoice: firstParsed.innerVoice };
  if (!isDegenerateDirectReply(input.prompt.message, first.text, request.history)) return first;
  const retryHistory = removeDegenerateReplyPattern(request.history, first.text);
  const retry = await requestAiReply(requestAi, {
    ...request,
    history: retryHistory,
    systemInstruction: [request.systemInstruction, CHAT_DEGENERATE_RETRY_INSTRUCTION].filter(Boolean).join("\n\n"),
  });
  const retryParsed = input.includeInnerVoice ? parseChatTurnResponse(retry.text) : { reply: retry.text };
  const normalizedRetry = { ...retry, text: retryParsed.reply, translation: retryParsed.translation, innerVoice: retryParsed.innerVoice };
  if (!normalizedRetry.text.trim() || isDegenerateDirectReply(input.prompt.message, normalizedRetry.text, request.history)) {
    throw new Error("模型连续返回重复或无意义的回复，本次回复已停止写入，请重试。");
  }
  return normalizedRetry;
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
