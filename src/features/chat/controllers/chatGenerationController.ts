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
import {
  buildAliasIdentityCorrectionPrompt,
  detectAliasIdentityBoundaryViolation,
  type AliasIdentityResponseGuardContext,
} from "../../../domain/prompt/aliasIdentityResponseGuard";
import { createAiActionId } from "../../../core/monitoring/aiRequestLedger";

type PromptInput = Pick<PromptContext, "scenario" | "message" | "history" | "systemInstruction" | "imageDataUrl" | "historyInjections">;
type RequestAi = typeof apiChat;

const CONTEXT_LENGTH_ERROR_PATTERN = /context[_ -]?(?:length|window)|max[_ -]?tokens?|token[_ -]?limit|too[_ -]?long|prompt[_ -]?too[_ -]?large|输入过长|上下文(?:太长|过长|超出)|令牌数量/iu;
const COMPACT_SYSTEM_INSTRUCTION_LIMIT = 14_000;

export function isContextLengthError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  const reason = typeof error === "object" && error !== null && "reason" in error
    ? String((error as { reason?: unknown }).reason || "")
    : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return code === "context_too_large" || CONTEXT_LENGTH_ERROR_PATTERN.test(`${reason} ${message}`);
}

const compactSystemInstruction = (systemInstruction: string): string => {
  const normalized = systemInstruction.trim();
  if (normalized.length <= COMPACT_SYSTEM_INSTRUCTION_LIMIT) return systemInstruction;
  const blocks = normalized.split(/\n\n---\n\n/gu);
  const priorityBlocks = blocks.filter((block) => /记忆|Truth|世界书|关系|角色|当前|规则|Profile|语言|格式/iu.test(block));
  const selected: string[] = [];
  const appendWithinBudget = (block: string) => {
    if (!block || selected.includes(block)) return;
    const projected = selected.join("\n\n---\n\n").length + (selected.length ? 8 : 0) + block.length;
    if (projected <= COMPACT_SYSTEM_INSTRUCTION_LIMIT) selected.push(block);
  };
  priorityBlocks.forEach(appendWithinBudget);
  blocks.slice(0, 4).forEach(appendWithinBudget);
  blocks.slice(-4).forEach(appendWithinBudget);
  if (selected.length === 0) {
    const headLength = Math.floor(COMPACT_SYSTEM_INSTRUCTION_LIMIT * 0.65);
    selected.push(normalized.slice(0, headLength), normalized.slice(-Math.floor(COMPACT_SYSTEM_INSTRUCTION_LIMIT * 0.3)));
  }
  return `${selected.join("\n\n---\n\n")}\n\n[本次请求上下文保护]\n仅压缩了本次发送中的重复系统描述；未删除聊天记录、记忆、摘要或档案。`;
};

/**
 * Produce progressively smaller, request-local variants. The original request
 * object and persisted history remain untouched; the empty-history variant is
 * only the last resort after keeping the newest turn and compacting system text.
 */
export function buildContextRecoveryRequests(request: AiChatRequest): AiChatRequest[] {
  const history = Array.isArray(request.history) ? request.history : [];
  const historyLengths = Array.from(new Set([
    Math.max(1, Math.ceil(history.length * 0.75)),
    Math.max(1, Math.ceil(history.length * 0.5)),
    Math.max(1, Math.ceil(history.length * 0.25)),
    0,
  ])).filter((length) => length < history.length);
  const variants: AiChatRequest[] = historyLengths.map((length) => ({
    ...request,
    history: length === 0 ? [] : history.slice(-length),
  }));
  const compactedSystemInstruction = compactSystemInstruction(request.systemInstruction || "");
  if (compactedSystemInstruction !== request.systemInstruction) {
    variants.push({
      ...request,
      history: history.slice(-Math.max(1, Math.ceil(history.length * 0.25))),
      systemInstruction: compactedSystemInstruction,
    });
    variants.push({ ...request, history: [], systemInstruction: compactedSystemInstruction });
  }
  return variants;
}

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
    retryReasons: ["response format validation"],
  });
  const retry = normalizeDirectChatResponse(retryRaw, true);
  if (!retry.formatIssue && retry.text.trim()) return retry;

  throw new Error("模型回复格式异常：重试后仍未得到有效文字回复。请更换模型或重试。");
};

const requestDirectChatResponseWithContextRecovery = async (input: {
  requestAi: RequestAi;
  request: AiChatRequest;
  includeInnerVoice?: boolean;
}): Promise<NormalizedDirectChatResponse> => {
  const requests = [input.request, ...buildContextRecoveryRequests(input.request)];
  let lastContextError: unknown;
  for (let index = 0; index < requests.length; index += 1) {
    try {
      if (index > 0) {
        console.warn(`[chat-context-recovery] retrying with request-local context reduction (${index}/${requests.length - 1})`);
      }
      return await requestDirectChatResponse({
        ...input,
        request: index > 0 ? { ...requests[index], retryReasons: ["context-too-large recovery"] } : requests[index],
      });
    } catch (error) {
      if (!isContextLengthError(error)) throw error;
      lastContextError = error;
    }
  }
  throw lastContextError || new Error("上下文过长，已尝试缩减本次请求后仍无法发送。未修改聊天记录或记忆，请减少本条消息或关闭部分附加设定后重试。");
};

export async function requestDirectChatTurn(input: {
  prompt: PromptInput;
  settings: UserSettings;
  requestAi?: RequestAi;
  signal?: AbortSignal;
  includeInnerVoice?: boolean;
  /** Optional identity-boundary validation for alias conversations. */
  aliasIdentityGuard?: AliasIdentityResponseGuardContext;
}): Promise<ParsedAiChatResponse> {
  const requestAi = input.requestAi || apiChat;
  const request = {
    ...buildComposedAiChatRequest(input.prompt, input.settings),
    signal: input.signal,
    purpose: "chat_reply" as const,
    parentActionId: createAiActionId(),
  };
  let response = await requestDirectChatResponseWithContextRecovery({ requestAi, request, includeInnerVoice: input.includeInnerVoice });
  if (isDegenerateDirectReply(input.prompt.message, response.text, request.history)) {
    const retryHistory = removeDegenerateReplyPattern(request.history, response.text);
    response = await requestDirectChatResponseWithContextRecovery({
      requestAi,
      request: {
        ...request,
        history: retryHistory,
        systemInstruction: [request.systemInstruction, CHAT_DEGENERATE_RETRY_INSTRUCTION].filter(Boolean).join("\n\n"),
        retryReasons: ["degenerate response correction"],
      },
      includeInnerVoice: input.includeInnerVoice,
    });
    if (!response.text.trim() || isDegenerateDirectReply(input.prompt.message, response.text, request.history)) {
      throw new Error("模型连续返回重复或无意义的回复，本次回复已停止写入，请重试。");
    }
  }

  const aliasGuard = input.aliasIdentityGuard;
  const violation = aliasGuard
    ? detectAliasIdentityBoundaryViolation(response.text, aliasGuard)
    : undefined;
  if (!violation) return response;

  // A single request-local retry keeps the generated wording/persona intact
  // while correcting only high-impact identity-boundary mistakes. Persisted
  // history and relationship data are never changed by this guard.
  console.warn(`[alias-identity-guard] retrying response after ${violation}`);
  const corrected = await requestDirectChatResponseWithContextRecovery({
    requestAi,
    request: {
      ...request,
      systemInstruction: [request.systemInstruction, buildAliasIdentityCorrectionPrompt(aliasGuard, violation)]
        .filter(Boolean)
        .join("\n\n"),
      retryReasons: ["alias identity boundary correction"],
    },
    includeInnerVoice: input.includeInnerVoice,
  });
  const correctedViolation = detectAliasIdentityBoundaryViolation(corrected.text, aliasGuard);
  if (correctedViolation) {
    console.warn(`[alias-identity-guard] retry still contains ${correctedViolation}; keeping the natural retry response`);
  }
  return corrected;
}

export function generateGroupChatTurn(input: {
  prompt: PromptInput; settings: UserSettings; members: readonly Character[]; groupId: string;
  disableBracketActions: boolean; createId: (index: number) => string; currentTime: () => number; requestAi?: RequestAi; signal?: AbortSignal;
}) {
  return generateGroupReplyCandidates({
    requestAi: input.requestAi || apiChat,
    request: {
      ...buildComposedAiChatRequest(input.prompt, input.settings),
      signal: input.signal,
      purpose: "group_chat_reply" as const,
      parentActionId: createAiActionId(),
    },
    members: input.members,
    groupId: input.groupId,
    disableBracketActions: input.disableBracketActions,
    createId: input.createId,
    currentTime: input.currentTime,
  });
}

export async function generateRegeneratedChatTurn(input: {
  prompt: PromptInput; settings: UserSettings; candidateContext: Omit<ReplyCandidateContext, "rawText">; requestAi?: RequestAi;
  aliasIdentityGuard?: AliasIdentityResponseGuardContext;
}) {
  const requestAi = input.requestAi || apiChat;
  const request = {
    ...buildComposedAiChatRequest(input.prompt, input.settings),
    purpose: "regenerate" as const,
    parentActionId: createAiActionId(),
  };
  let data = await requestAiReply(requestAi, request);
  const violation = input.aliasIdentityGuard
    ? detectAliasIdentityBoundaryViolation(data.text, input.aliasIdentityGuard)
    : undefined;
  if (violation) {
    console.warn(`[alias-identity-guard] retrying regenerated response after ${violation}`);
    const corrected = await requestAiReply(requestAi, {
      ...request,
      systemInstruction: [request.systemInstruction, buildAliasIdentityCorrectionPrompt(input.aliasIdentityGuard!, violation)]
        .filter(Boolean)
        .join("\n\n"),
      retryReasons: ["alias identity boundary correction"],
    });
    if (corrected.text.trim()) data = corrected;
  }
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
    request: {
      ...buildComposedAiChatRequest(input.prompt, input.settings),
      purpose: "proactive_message" as const,
      parentActionId: createAiActionId(),
    },
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
