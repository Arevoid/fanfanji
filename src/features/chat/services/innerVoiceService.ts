import type { apiChat } from "../../../utils/apiHelper";
import type { Character, InnerVoiceRecord, MemoryItem, Message, UserSettings } from "../../../types";
import { buildInnerVoicePrompt } from "../../../domain/prompt/innerVoicePrompt";
import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import { findInnerVoiceByRelationAndMessage, loadInnerVoiceRecords, saveInnerVoiceRecords } from "../../../core/storage/repositories/innerVoiceRepository";

export interface RequestInnerVoiceParams {
  character: Character;
  triggerMessage: Message;
  recentMessages: Message[];
  relevantMemories?: readonly MemoryItem[];
  relationId: string;
  conversationId: string;
  settings: UserSettings;
  requestAi: typeof apiChat;
}

interface InnerVoicePayload {
  state: string;
  content: string;
}

const inFlightInnerVoices = new Map<string, Promise<InnerVoiceRecord | null>>();

function parseInnerVoicePayload(text: string): InnerVoicePayload | null {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed: unknown = JSON.parse(normalized.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object") return null;
    const { state, content } = parsed as Partial<InnerVoicePayload>;
    if (typeof state !== "string" || !state.trim() || typeof content !== "string" || !content.trim()) return null;
    return { state: state.trim().slice(0, 120), content: content.trim().slice(0, 1000) };
  } catch {
    return null;
  }
}

function createRecordId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `inner-voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function requestInnerVoice({
  character,
  triggerMessage,
  recentMessages,
  relevantMemories,
  relationId,
  conversationId,
  settings,
  requestAi,
}: RequestInnerVoiceParams): Promise<InnerVoiceRecord | null> {
  const systemInstruction = buildInnerVoicePrompt({
    character,
    currentMessage: triggerMessage,
    recentMessages,
    relevantMemories,
  });
  const response = await requestAi({
    message: "请按要求仅返回角色当前心声的 JSON。",
    history: [],
    systemInstruction,
    apiKey: settings.apiKey || "",
    model: settings.selectedModel,
    apiEndpoint: settings.apiEndpoint,
    apiTemperature: settings.apiTemperature,
    streamCompatible: settings.streamCompatible,
  });
  const payload = parseInnerVoicePayload(response.text);
  if (!payload) return null;

  return {
    id: createRecordId(),
    characterId: resolveCanonicalCharacterId(character),
    relationId,
    messageId: triggerMessage.id,
    conversationId,
    triggerMessageSummary: triggerMessage.content.trim().slice(0, 160),
    state: payload.state,
    content: payload.content,
    createdAt: Date.now(),
  };
}

/** Reuses persisted records and coalesces concurrent clicks for one message. */
export async function getOrCreateInnerVoice(params: RequestInnerVoiceParams): Promise<InnerVoiceRecord | null> {
  const existing = findInnerVoiceByRelationAndMessage(params.relationId, params.triggerMessage.id);
  if (existing) return existing;

  const key = `${params.relationId}:${params.triggerMessage.id}`;
  let request = inFlightInnerVoices.get(key);
  if (!request) {
    request = requestInnerVoice(params).then((record) => {
      if (!record) return null;
      const records = loadInnerVoiceRecords().value;
      const duplicate = records.find((item) => item.relationId === record.relationId && item.messageId === record.messageId);
      if (duplicate) return duplicate;
      const write = saveInnerVoiceRecords([...records, record]);
      return write.success ? record : null;
    }).finally(() => {
      inFlightInnerVoices.delete(key);
    });
    inFlightInnerVoices.set(key, request);
  }
  return request;
}

export function resetInnerVoiceRuntimeForTests(): void {
  inFlightInnerVoices.clear();
}

export { parseInnerVoicePayload };
