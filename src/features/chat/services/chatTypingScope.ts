import type { ChatRuntimeContext } from "../context/chatRuntimeContext";

export interface ChatTypingScopeEntry<TCharacter> {
  isTyping: boolean;
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
