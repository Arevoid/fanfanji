import type { PromptHistoryInjection } from "../../../domain/prompt/promptTypes";
import type { UserSettings } from "../../../types";
import {
  buildDirectChatContextSnapshot,
  type DirectChatContextSnapshot,
  type DirectChatContextSnapshotInput,
} from "./directChatContextSnapshotBuilder";
import {
  buildDirectChatSystemInstruction,
  type DirectChatPromptBuilderInput,
} from "../prompts/directChatPromptBuilder";
import type { AliasIdentityResponseGuardContext } from "../../../domain/prompt/aliasIdentityResponseGuard";

export type DirectReplyPreparationContextInput = DirectChatContextSnapshotInput;
export type DirectReplyPreparationContext = DirectChatContextSnapshot;

/**
 * Normal direct-reply preparation owns only the shared history snapshot and
 * established prompt ordering. Feature services still provide already-built
 * material; no storage, retrieval, React state, or provider call belongs here.
 */
export function prepareDirectReplyContext(
  input: DirectReplyPreparationContextInput,
): DirectReplyPreparationContext {
  return buildDirectChatContextSnapshot(input);
}

export type DirectReplyPromptPreparationInput = Omit<DirectChatPromptBuilderInput, "diagnosticLabel">;

export interface DirectReplyPreparationInput {
  context: DirectReplyPreparationContext;
  prompt: DirectReplyPromptPreparationInput;
  message: string;
  imageDataUrl?: string;
  historyInjections?: readonly PromptHistoryInjection[];
  settings: UserSettings;
  signal?: AbortSignal;
  includeInnerVoice?: boolean;
  aliasIdentityGuard?: AliasIdentityResponseGuardContext;
}

export interface PreparedDirectReplyTurn {
  context: DirectReplyPreparationContext;
  systemInstruction: string;
  request: {
    prompt: {
      scenario: "direct-chat";
      message: string;
      history: DirectReplyPreparationContext["history"];
      systemInstruction: string;
      imageDataUrl?: string;
      historyInjections?: readonly PromptHistoryInjection[];
    };
    settings: UserSettings;
    signal?: AbortSignal;
    includeInnerVoice?: boolean;
    aliasIdentityGuard?: AliasIdentityResponseGuardContext;
  };
}

/**
 * Turns prepared application material into the existing direct-chat request
 * shape. This is deliberately a pure, provider-free boundary: request
 * retries, ledger accounting, parsing, delivery, and post-reply work remain
 * below/above this function at their existing layers.
 */
export function prepareDirectReplyTurn(input: DirectReplyPreparationInput): PreparedDirectReplyTurn {
  const systemInstruction = buildDirectChatSystemInstruction({
    ...input.prompt,
    diagnosticLabel: "direct chat prompt",
  });
  return {
    context: input.context,
    systemInstruction,
    request: {
      prompt: {
        scenario: "direct-chat",
        message: input.message,
        history: input.context.history,
        systemInstruction,
        imageDataUrl: input.imageDataUrl,
        historyInjections: input.historyInjections,
      },
      settings: input.settings,
      signal: input.signal,
      includeInnerVoice: input.includeInnerVoice,
      aliasIdentityGuard: input.aliasIdentityGuard,
    },
  };
}
