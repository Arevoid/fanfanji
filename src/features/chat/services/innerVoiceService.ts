import type { Character, InnerVoiceRecord, Message, UserSettings, WorldBookEntry } from "../../../types";
import { createId } from "../../../core/id/createId";
import { apiChat } from "../../../utils/apiHelper";
import { buildInnerVoicePrompt } from "../../../domain/prompt/innerVoicePrompt";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";
import { buildWorldBookSystemBlocks } from "../../../utils/worldBook";
import { serializeMessageContentForPrompt } from "../prompts/messagePromptSerializer";
import type { InlineInnerVoicePayload } from "./chatTurnResponseProtocol";

export interface GenerateInnerVoiceInput {
  character: Character;
  relationship?: CharacterRelationship;
  triggerMessage: Message;
  recentMessages: Message[];
  conversationId?: string;
  relationId?: string;
  groupId?: string;
  context?: ChatRuntimeContext;
  settings: UserSettings;
  offlineContinuityContext?: string;
  worldBookEntries?: readonly WorldBookEntry[];
}

export function createInlineInnerVoiceRecord(input: {
  character: Character;
  triggerMessage: Message;
  relationId?: string;
  groupId?: string;
  conversationId: string;
  payload: InlineInnerVoicePayload;
  settings: UserSettings;
}): InnerVoiceRecord {
  const summary = serializeMessageContentForPrompt(input.triggerMessage, {
    mode: "history",
    userName: input.settings.name,
    characterName: input.character.name,
  });
  return {
    id: createId("inner-voice"),
    characterId: input.character.id,
    relationId: input.relationId,
    groupId: input.groupId,
    messageId: input.triggerMessage.id,
    conversationId: input.conversationId,
    triggerMessageSummary: summary.slice(0, 120),
    emotionalState: input.payload.emotionalState,
    state: input.payload.emotionalState,
    content: input.payload.content,
    createdAt: Date.now(),
  };
}

function parseInnerVoice(text: string): { content: string; emotionalState: string } | null {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const value: unknown = JSON.parse(candidate.slice(start, end + 1));
    if (!value || typeof value !== "object") return null;
    const record = value as { content?: unknown; emotionalState?: unknown };
    if (typeof record.content !== "string" || typeof record.emotionalState !== "string") return null;
    if (!record.content.trim() || !record.emotionalState.trim()) return null;
    return { content: record.content.trim(), emotionalState: record.emotionalState.trim() };
  } catch {
    return null;
  }
}

/** Generates one standalone record. Persistence is intentionally owned by the repository caller. */
export async function generateInnerVoice(input: GenerateInnerVoiceInput): Promise<InnerVoiceRecord | null> {
  const relationId = input.relationId ?? input.context?.relationId ?? undefined;
  const groupId = input.groupId ?? input.context?.groupId ?? undefined;
  const conversationId = input.conversationId ?? input.context?.conversationId ?? undefined;
  if ((!relationId && !groupId) || conversationId === undefined) return null;

  const worldBook = input.relationship ? buildWorldBookSystemBlocks(
    [...(input.worldBookEntries || [])], input.character.id,
    input.recentMessages.slice(-10).map((message) => serializeMessageContentForPrompt(message, { mode: "history", userName: input.settings.name, characterName: input.character.name })).join("\n"),
    { scenario: "chat", characterId: input.relationship.characterId, userIdentityId: input.relationship.userIdentityId, relationId: input.relationship.id },
  ) : undefined;
  const composedPrompt = PromptComposer.compose({
    scenario: "inner-voice",
    message: "请根据指令生成这一次的角色心声。",
    history: [],
    systemInstruction: [buildInnerVoicePrompt({
      character: input.character,
      relationship: input.relationship,
      relationId,
      triggerMessage: input.triggerMessage,
      recentMessages: input.recentMessages,
      userName: input.settings.name,
      offlineContinuityContext: input.offlineContinuityContext,
    }), worldBook?.formattedAll ? `[本次心声可使用的关系世界书]\n${worldBook.formattedAll}\n只将其作为角色认知背景，不要逐条复述。` : ""].filter(Boolean).join("\n\n"),
    historyInjections: worldBook?.at_depth,
  });
  const response = await apiChat({
    ...composedPrompt,
    apiKey: input.settings.apiKey,
    model: input.settings.selectedModel || "gemini-3.5-flash",
    apiEndpoint: input.settings.apiEndpoint,
    apiTemperature: input.settings.apiTemperature,
    streamCompatible: input.settings.streamCompatible,
  });
  const parsed = parseInnerVoice(response.text);
  if (!parsed) return null;
  return {
    id: createId("inner-voice"),
    characterId: input.character.id,
    relationId,
    groupId,
    messageId: input.triggerMessage.id,
    conversationId,
    triggerMessageSummary: serializeMessageContentForPrompt(input.triggerMessage, { mode: "history", userName: input.settings.name, characterName: input.character.name }).slice(0, 120),
    emotionalState: parsed.emotionalState,
    state: parsed.emotionalState,
    content: parsed.content,
    createdAt: Date.now(),
  };
}
