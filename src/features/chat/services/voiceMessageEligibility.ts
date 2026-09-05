import type { Character, Message } from "../../../types";
import type { DirectInteractionScope } from "../context/directInteractionScope";

/** Parenthesized actions, narration, and stage directions are never spoken voice bubbles. */
export const isBracketWrappedNarration = (text: string): boolean =>
  /^\s*[（(][\s\S]*[）)]\s*$/.test(text);

const VOICE_REQUEST_PATTERN = /(发|来|用|录|说).{0,8}(语音|声音)|想听.{0,8}(声音|语音)|语音.{0,8}(说|回复|回)|给我.{0,8}(语音|声音)/i;
const VOICE_CONTEXT_PATTERN = /(唱歌|唱一段|哼歌|哼唱|清唱|低声|小声|轻声|悄声|耳语|声音|嗓音|语音)/i;
const VOICE_PREFERENCE_PATTERN = /(爱发语音|喜欢.{0,4}语音|经常.{0,4}语音|习惯.{0,4}语音|用语音聊天)/i;

export const isExplicitVoiceRequest = (text?: string): boolean =>
  Boolean(text && VOICE_REQUEST_PATTERN.test(text));

export const hasExplicitVoicePreference = (character: Character): boolean =>
  character.voiceFrequency === "high" || VOICE_PREFERENCE_PATTERN.test(`${character.personality || ""}\n${character.backstory || ""}`);

export type AutomaticVoiceScope = DirectInteractionScope;

/**
 * Direct-message records do not duplicate userIdentityId. The relationship ID
 * is the identity boundary; conversationId is an additional consistency guard.
 * Legacy unscoped records must not influence a modern relationship's cooldown.
 */
const belongsToAutomaticVoiceScope = (message: Message, scope: AutomaticVoiceScope): boolean => {
  if (message.relationId !== scope.relationId) return false;
  if (message.characterId !== scope.characterId) return false;
  return !message.conversationId || message.conversationId === scope.conversationId;
};

const isCharacterVoiceMarkup = (message: Message, scope: AutomaticVoiceScope): boolean =>
  message.sender === "character"
  && belongsToAutomaticVoiceScope(message, scope)
  && (message.isVoiceMessage === true || message.content.startsWith("[语音"));

export interface AutomaticVoiceConversionInput {
  character: Character;
  lastUserMessage: Message | null;
  recentMessages: readonly Message[];
  bubbleIndex: number;
  bubbleText: string;
  scope: AutomaticVoiceScope;
  random?: () => number;
}

/** Keeps generated chat text as text by default; explicit model markup is unchanged. */
export function shouldAutomaticallyConvertTextToVoice(input: AutomaticVoiceConversionInput): boolean {
  const { character, lastUserMessage, recentMessages, bubbleIndex, bubbleText, scope } = input;
  if (!scope.characterId || !scope.relationId || !scope.userIdentityId) return false;
  if (character.voiceFrequency === "none" || bubbleIndex !== 0 || !bubbleText || isBracketWrappedNarration(bubbleText)) return false;
  if (/^\[(?:语音|表情|红包|转账|系统|位置|音乐|文件|视频通话|语音通话)/.test(bubbleText) || bubbleText.startsWith("data:image/")) return false;

  const scopedLastUserMessage = lastUserMessage?.sender === "user" && belongsToAutomaticVoiceScope(lastUserMessage, scope)
    ? lastUserMessage
    : null;
  if (isExplicitVoiceRequest(scopedLastUserMessage?.content)) return true;
  if (recentMessages.some((message) => isCharacterVoiceMarkup(message, scope))) return false;

  const hasPreference = hasExplicitVoicePreference(character);
  const needsVoiceForContext = VOICE_CONTEXT_PATTERN.test(`${scopedLastUserMessage?.content || ""}\n${bubbleText}`);
  if (!hasPreference && !needsVoiceForContext) return false;

  return (input.random || Math.random)() < (hasPreference ? 0.18 : 0.08);
}
