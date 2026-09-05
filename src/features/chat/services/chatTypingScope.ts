import type { ChatRuntimeContext } from "../context/chatRuntimeContext";

export interface ChatTypingScopeEntry<TCharacter> {
  isTyping: boolean;
  activity: "typing" | "generating-image";
  characterOverride: TCharacter | null;
}

export type ChatTypingScopeState<TCharacter> = Record<string, ChatTypingScopeEntry<TCharacter>>;

export function getChatTypingScopeKey(context: ChatRuntimeContext): string {
  return JSON.stringify([
    context.isGroup ? "group" : "direct",
    context.userIdentityId,
    context.relationId,
    context.conversationId,
    context.groupId || null,
    context.characterId,
  ]);
}

export function setChatScopeTyping<TCharacter>(
  state: ChatTypingScopeState<TCharacter>,
  scopeKey: string,
  isTyping: boolean,
): ChatTypingScopeState<TCharacter> {
  if (isTyping) {
    return {
      ...state,
      [scopeKey]: {
        isTyping: true,
        activity: state[scopeKey]?.activity === "generating-image" ? "generating-image" : "typing",
        characterOverride: state[scopeKey]?.characterOverride || null,
      },
    };
  }

  if (!state[scopeKey]) return state;
  if (state[scopeKey].activity === "generating-image") return state;
  const next = { ...state };
  delete next[scopeKey];
  return next;
}

export function setChatScopeImageGeneration<TCharacter>(
  state: ChatTypingScopeState<TCharacter>,
  scopeKey: string,
  isGeneratingImage: boolean,
): ChatTypingScopeState<TCharacter> {
  if (isGeneratingImage) {
    return {
      ...state,
      [scopeKey]: {
        isTyping: true,
        activity: "generating-image",
        characterOverride: state[scopeKey]?.characterOverride || null,
      },
    };
  }

  if (!state[scopeKey]) return state;
  const next = { ...state };
  delete next[scopeKey];
  return next;
}

export function setChatScopeCharacterOverride<TCharacter>(
  state: ChatTypingScopeState<TCharacter>,
  scopeKey: string,
  characterOverride: TCharacter | null,
): ChatTypingScopeState<TCharacter> {
  const current = state[scopeKey];
  if (!current && characterOverride === null) return state;
  return {
    ...state,
    [scopeKey]: {
      isTyping: current?.isTyping || false,
      activity: current?.activity || "typing",
      characterOverride,
    },
  };
}

export function getVisibleChatTyping<TCharacter>(
  state: ChatTypingScopeState<TCharacter>,
  activeScopeKey: string,
): ChatTypingScopeEntry<TCharacter> | null {
  const entry = state[activeScopeKey];
  return entry?.isTyping ? entry : null;
}
