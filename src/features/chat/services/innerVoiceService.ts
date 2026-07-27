import type { Character, InnerVoiceRecord, Message, UserSettings } from "../../../types";
import { apiChat } from "../../../utils/apiHelper";
import { buildInnerVoicePrompt } from "../../../domain/prompt/innerVoicePrompt";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";

export interface GenerateInnerVoiceInput {
  character: Character;
  relationship?: CharacterRelationship;
  triggerMessage: Message;
  recentMessages: Message[];
  conversationId: string;
  relationId?: string;
  groupId?: string;
  settings: UserSettings;
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
  // A record is valid only when it has an explicit direct or group boundary.
  if (!input.relationId && !input.groupId) return null;
  const response = await apiChat({
    message: "请根据指令生成这一次的角色心声。",
    history: [],
    systemInstruction: buildInnerVoicePrompt({
      character: input.character,
      relationship: input.relationship,
      relationId: input.relationId,
      triggerMessage: input.triggerMessage,
      recentMessages: input.recentMessages,
      userName: input.settings.name,
    }),
    apiKey: input.settings.apiKey,
    model: input.settings.selectedModel || "gemini-3.5-flash",
    apiEndpoint: input.settings.apiEndpoint,
    apiTemperature: input.settings.apiTemperature,
    streamCompatible: input.settings.streamCompatible,
  });
  const parsed = parseInnerVoice(response.text);
  if (!parsed) return null;

  return {
    id: `inner-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    characterId: input.character.id,
    relationId: input.relationId,
    groupId: input.groupId,
    messageId: input.triggerMessage.id,
    conversationId: input.conversationId,
    triggerMessageSummary: input.triggerMessage.content.slice(0, 120),
    emotionalState: parsed.emotionalState,
    // Keep the legacy field populated for old consumers; UI uses emotionalState for new records.
    state: parsed.emotionalState,
    content: parsed.content,
    createdAt: Date.now(),
  };
}
