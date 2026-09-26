import { apiChat } from "../../utils/apiHelper";
import type { Character, Message, UserSettings } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";

const MAX_CONTEXT_MESSAGES = 12;

export interface CharacterBlockAiInput {
  character: Pick<Character, "id" | "name" | "personality" | "backstory">;
  relationship: Pick<CharacterRelationship, "id" | "relationship" | "blockedBy" | "blockCycleId">;
  recentMessages?: readonly Message[];
  previousRequestRemarks?: readonly string[];
  requestCreated: boolean;
  attempt?: number;
  settings?: UserSettings;
  now?: number;
}

export interface CharacterBlockAiOutput {
  phoneMessages: string[];
  friendRequestRemark?: string;
}

function trim(value: unknown, max = 600): string {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ").slice(0, max) : "";
}

function compactHistory(messages: readonly Message[] | undefined): string {
  return (messages || [])
    .filter((message) => trim(message.content))
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => `${message.sender === "user" ? "对方" : "角色"}：${trim(message.content, 360)}`)
    .join("\n") || "（没有可用的近期对话。）";
}

function normalizeMessage(value: unknown): string | null {
  const text = trim(value, 240)
    .replace(/^```(?:text|plain)?\s*/iu, "")
    .replace(/```\s*$/u, "")
    .replace(/^(?:消息|反应|回复|角色消息)[：:]\s*/u, "")
    .trim();
  if (text.length < 2 || text.length > 240) return null;
  if (/(提示词|系统指令|模型|AI|程序|模板|JSON|API)/iu.test(text)) return null;
  return text;
}

function parseResponse(text: string, requestCreated: boolean): CharacterBlockAiOutput | null {
  let parsedText = text.trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/```\s*$/u, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(parsedText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as { phoneMessages?: unknown; friendRequestRemark?: unknown; remark?: unknown };
  const phoneMessages = Array.isArray(raw.phoneMessages)
    ? raw.phoneMessages.map(normalizeMessage).filter((message): message is string => Boolean(message)).slice(0, 3)
    : [];
  const friendRequestRemark = requestCreated
    ? normalizeMessage(raw.friendRequestRemark ?? raw.remark)
    : undefined;
  if (phoneMessages.length === 0) return null;
  if (requestCreated && !friendRequestRemark) return null;
  return {
    phoneMessages,
    ...(friendRequestRemark ? { friendRequestRemark } : {}),
  };
}

export function buildCharacterBlockAiPrompt(input: CharacterBlockAiInput): {
  message: string;
  systemInstruction: string;
} {
  const attempt = Math.max(1, input.attempt || 1);
  const previous = (input.previousRequestRemarks || []).map((remark) => trim(remark, 240)).filter(Boolean).slice(-5);
  return {
    message: [
      `请为角色“${trim(input.character.name, 80)}”生成一次“对方把我拉黑后”的完整反应。`,
      `人物性格：${trim(input.character.personality, 1200) || "未提供"}`,
      `人物背景：${trim(input.character.backstory, 1200) || "未提供"}`,
      `关系类型：${trim(input.relationship.relationship, 80) || "未提供"}`,
      `拉黑方向：${input.relationship.blockedBy === "user" ? "对方拉黑了角色" : "角色拉黑了对方"}`,
      `这是第 ${attempt} 次重新建立联系的尝试。`,
      `最近对话（按时间顺序，必须以此为主要依据）：\n${compactHistory(input.recentMessages)}`,
      `之前已经使用过的好友申请备注（不能重复或改写成同一句）：\n${previous.length > 0 ? previous.join("\n") : "（无）"}`,
      input.requestCreated
        ? "这次需要同时写角色手机里的反应消息和一条好友申请备注。"
        : "这次不发送好友申请，只写角色手机里的反应消息。",
      `当前时间戳：${input.now ?? Date.now()}`,
    ].join("\n"),
    systemInstruction: `你正在模拟真实角色，不是在选择固定文案。必须阅读最近对话，结合人物性格、关系和当下情绪，写出这一次独有的自然反应。不要因为“拉黑”两个字就套用统一的质问句；如果最近刚发生了具体事件，应自然提到它，但不要生硬复述整段对话。
只输出严格 JSON，不要 Markdown、解释或前后缀：{"phoneMessages":["角色手机里的第1条消息","可选的第2条消息"],"friendRequestRemark":"${input.requestCreated ? "好友申请备注" : ""}"}。
phoneMessages 生成 1—3 条，每条 1—3 句，必须像角色写给自己手机联系人的真实消息，并且保持同一情绪/话题。friendRequestRemark 只写一条适合好友申请列表展示的短备注，不能和以前的备注重复。不能提到系统、模型、提示词、程序、模板、JSON、API，也不能声称已经收到对方看不见的消息。` ,
  };
}

export async function generateCharacterBlockAiResponse(input: CharacterBlockAiInput): Promise<CharacterBlockAiOutput | null> {
  const settings = input.settings;
  if (!settings?.apiKey?.trim() || !settings.selectedModel?.trim()) return null;
  const prompt = buildCharacterBlockAiPrompt(input);
  try {
    const response = await apiChat({
      message: prompt.message,
      history: [],
      systemInstruction: prompt.systemInstruction,
      apiKey: settings.apiKey,
      model: settings.selectedModel,
      apiEndpoint: settings.apiEndpoint,
      apiTemperature: Math.max(0.75, settings.apiTemperature ?? 0.9),
      streamCompatible: settings.streamCompatible,
      purpose: "character_phone_generate",
      characterId: input.character.id,
      relationId: input.relationship.id,
    });
    return parseResponse(response.text, input.requestCreated);
  } catch {
    return null;
  }
}
