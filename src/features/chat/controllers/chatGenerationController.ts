import type { Character, UserSettings } from "../../../types";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import type { PromptContext } from "../../../domain/prompt/promptTypes";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import { apiChat } from "../../../utils/apiHelper";
import { requestAiReply } from "../services/aiReplyService";
import { generateGroupReplyCandidates } from "../services/groupChatService";
import { generateProactiveReplyCandidates } from "../services/proactiveMessageService";
import { createRegeneratedReplyCandidates } from "../services/regenerateService";
import type { AiChatRequest, ReplyCandidateContext } from "../services/chatServiceTypes";
import { buildTextAiRuntimeConfig } from "../services/textAiRuntimeConfig";

type PromptInput = Pick<PromptContext, "scenario" | "message" | "history" | "systemInstruction" | "historyInjections">;
type RequestAi = typeof apiChat;

export function buildComposedAiChatRequest(prompt: PromptInput, settings: UserSettings): AiChatRequest {
  return { ...PromptComposer.compose(prompt), ...buildTextAiRuntimeConfig(settings) };
}

export function requestDirectChatTurn(input: { prompt: PromptInput; settings: UserSettings; requestAi?: RequestAi }) {
  return requestAiReply(input.requestAi || apiChat, buildComposedAiChatRequest(input.prompt, input.settings));
}

export function generateGroupChatTurn(input: {
  prompt: PromptInput; settings: UserSettings; members: readonly Character[]; groupId: string;
  disableBracketActions: boolean; createId: (index: number) => string; currentTime: () => number; requestAi?: RequestAi;
}) {
  return generateGroupReplyCandidates({
    requestAi: input.requestAi || apiChat,
    request: buildComposedAiChatRequest(input.prompt, input.settings),
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
    cognitiveContext: input.cognitiveContext,
  });
}
