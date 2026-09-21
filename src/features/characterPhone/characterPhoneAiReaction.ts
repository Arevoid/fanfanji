import { apiChat } from "../../utils/apiHelper";
import type { Character, UserSettings } from "../../types";
import type { CharacterPhoneActionRecord } from "../../domain/characterPhone/types";

const MAX_CONTEXT_ITEMS = 8;

export interface CharacterPhoneDiscoveryAiInput {
  character: Character;
  action: CharacterPhoneActionRecord;
  relationshipContext?: string;
  worldBookContext?: readonly string[];
  recentConversation?: readonly string[];
  recentDiscoveries?: readonly string[];
  settings?: UserSettings;
  now?: number;
}

export interface CharacterPhoneBrowserReflectionAiInput {
  character: Character;
  query: string;
  title?: string;
  relationshipContext?: string;
  worldBookContext?: readonly string[];
  recentConversation?: readonly string[];
  recentReflections?: readonly string[];
  settings?: UserSettings;
  now?: number;
}

export interface CharacterPhoneAwarenessAiInput {
  character: Character;
  level: 1 | 2;
  attemptCount: number;
  relationshipContext?: string;
  worldBookContext?: readonly string[];
  recentConversation?: readonly string[];
  recentAwarenessMessages?: readonly string[];
  settings?: UserSettings;
  now?: number;
}

function trim(value: unknown, max = 1200): string {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ").slice(0, max) : "";
}

function compactContext(values: readonly string[] | undefined, max = MAX_CONTEXT_ITEMS): string {
  return (values || [])
    .map((value) => trim(value, 360))
    .filter(Boolean)
    .slice(-max)
    .join("\n");
}

function parseText(value: string): string {
  let text = trim(value, 600);
  text = text.replace(/^```(?:text|plain)?\s*/iu, "").replace(/```\s*$/u, "").trim();
  try {
    const parsed = JSON.parse(text) as { message?: unknown; reflection?: unknown; text?: unknown };
    text = trim(parsed.message ?? parsed.reflection ?? parsed.text, 600) || text;
  } catch {
    // Plain text is the preferred provider response.
  }
  return text
    .replace(/^(?:角色(?:消息|心声)|消息|心声|回复|反应)[：:]\s*/u, "")
    .trim();
}

function isUnsafeMetaText(text: string): boolean {
  return /(?:提示词|系统指令|模型|AI|程序|模板|api|JSON|用户操作了手机的证据)/iu.test(text);
}

function isRepeated(text: string, previous: readonly string[] | undefined): boolean {
  const normalized = text.replace(/[\s“”"'，。！？!?、]/gu, "").toLocaleLowerCase();
  if (!normalized) return true;
  return (previous || []).some((item) => {
    const other = trim(item, 600).replace(/[\s“”"'，。！？!?、]/gu, "").toLocaleLowerCase();
    if (!other) return false;
    return normalized === other || normalized.includes(other) || other.includes(normalized);
  });
}

function normalizeGeneratedText(value: unknown, previous?: readonly string[]): string | null {
  const text = parseText(typeof value === "string" ? value : "");
  if (!text || text.length < 4 || text.length > 240 || isUnsafeMetaText(text) || isRepeated(text, previous)) return null;
  return text;
}

export function buildCharacterPhoneDiscoveryAiPrompt(input: CharacterPhoneDiscoveryAiInput): {
  message: string;
  systemInstruction: string;
} {
  const character = input.character;
  const action = input.action;
  return {
    message: [
      `现在请以角色“${trim(character.name, 80)}”的口吻，写一条发现手机异常后的自然消息。`,
      `人物性格：${trim(character.personality, 1200) || "未提供"}`,
      `人物背景：${trim(character.backstory, 1200) || "未提供"}`,
      `关系背景：${trim(input.relationshipContext, 600) || "未提供"}`,
      `世界书线索：${compactContext(input.worldBookContext) || "无"}`,
      `最近相关对话：${compactContext(input.recentConversation) || "无"}`,
      `本次手机操作证据：${[
        action.kind,
        action.app,
        trim(action.detail, 260),
        trim(action.contentSnapshot, 360),
      ].filter(Boolean).join("｜")}`,
      `角色过去已经发过的发现消息（不能重复）：${compactContext(input.recentDiscoveries) || "无"}`,
      `当前时间戳：${input.now ?? Date.now()}`,
    ].join("\n"),
    systemInstruction: `你正在模拟真实角色，不是在套用示例文案。只输出一条可直接发送给对方的中文消息，1—3句，20—120字。必须依据人物性格、关系和具体手机操作来写，可以质问、试探、冷处理、讽刺、担心或假装没看见，但不要脱离人设。没有足够证据时不能断言对方就是操作者；不要提及系统、模型、提示词、程序、模板或“用户操作手机”。不要复述操作日志，不要添加前缀、引号、Markdown或解释。必须与给出的历史发现消息不同。`,
  };
}

export async function generateCharacterPhoneDiscoveryMessage(
  input: CharacterPhoneDiscoveryAiInput,
): Promise<string | null> {
  const settings = input.settings;
  if (!settings?.apiKey?.trim() || !settings.selectedModel?.trim()) return null;
  const prompt = buildCharacterPhoneDiscoveryAiPrompt(input);
  try {
    const response = await apiChat({
      message: prompt.message,
      history: [],
      systemInstruction: prompt.systemInstruction,
      apiKey: settings.apiKey,
      model: settings.selectedModel,
      apiEndpoint: settings.apiEndpoint,
      apiTemperature: settings.apiTemperature ?? 0.9,
      streamCompatible: settings.streamCompatible,
      purpose: "character_phone_generate",
      characterId: input.character.id,
    });
    return normalizeGeneratedText(response.text, input.recentDiscoveries);
  } catch {
    return null;
  }
}

export function buildCharacterPhoneAwarenessAiPrompt(input: CharacterPhoneAwarenessAiInput): {
  message: string;
  systemInstruction: string;
} {
  const character = input.character;
  const lockState = input.level >= 2 ? "多次失败后手机已经暂时锁定" : "出现了一次或几次未成功的解锁尝试";
  return {
    message: [
      `请以角色“${trim(character.name, 80)}”的口吻，写一条发现自己手机解锁异常后的消息。`,
      `人物性格：${trim(character.personality, 1200) || "未提供"}`,
      `人物背景：${trim(character.backstory, 1200) || "未提供"}`,
      `关系背景：${trim(input.relationshipContext, 600) || "未提供"}`,
      `世界书线索：${compactContext(input.worldBookContext) || "无"}`,
      `最近相关对话：${compactContext(input.recentConversation) || "无"}`,
      `事实状态：${lockState}；累计失败尝试约 ${Math.max(1, input.attemptCount)} 次。`,
      `角色过去已经发过的异常提醒（不能重复）：${compactContext(input.recentAwarenessMessages) || "无"}`,
      `当前时间戳：${input.now ?? Date.now()}`,
    ].join("\n"),
    systemInstruction: `你正在模拟真实角色对手机解锁异常的反应。只输出一条可直接发给对方的中文消息，1—3句，20—120字。根据人物性格和关系决定是担心、试探、警惕、冷淡、讽刺还是直接询问；没有证据时不能断言对方就是操作者。不要提及系统、模型、提示词、程序、模板或用户操作记录，不要添加前缀、Markdown或解释，必须与历史提醒不同。`,
  };
}

export async function generateCharacterPhoneAwarenessMessage(
  input: CharacterPhoneAwarenessAiInput,
): Promise<string | null> {
  const settings = input.settings;
  if (!settings?.apiKey?.trim() || !settings.selectedModel?.trim()) return null;
  const prompt = buildCharacterPhoneAwarenessAiPrompt(input);
  try {
    const response = await apiChat({
      message: prompt.message,
      history: [],
      systemInstruction: prompt.systemInstruction,
      apiKey: settings.apiKey,
      model: settings.selectedModel,
      apiEndpoint: settings.apiEndpoint,
      apiTemperature: settings.apiTemperature ?? 0.9,
      streamCompatible: settings.streamCompatible,
      purpose: "character_phone_generate",
      characterId: input.character.id,
    });
    return normalizeGeneratedText(response.text, input.recentAwarenessMessages);
  } catch {
    return null;
  }
}

export function buildCharacterPhoneBrowserReflectionAiPrompt(input: CharacterPhoneBrowserReflectionAiInput): {
  message: string;
  systemInstruction: string;
} {
  const character = input.character;
  return {
    message: [
      `请以角色“${trim(character.name, 80)}”的第一人称，写这次搜索后的私下心声。`,
      `搜索词：${trim(input.query, 180)}`,
      `搜索标题：${trim(input.title, 180) || "未提供"}`,
      `人物性格：${trim(character.personality, 1200) || "未提供"}`,
      `人物背景：${trim(character.backstory, 1200) || "未提供"}`,
      `关系背景：${trim(input.relationshipContext, 600) || "未提供"}`,
      `世界书线索：${compactContext(input.worldBookContext) || "无"}`,
      `最近相关对话：${compactContext(input.recentConversation) || "无"}`,
      `角色最近的浏览心声（不能重复）：${compactContext(input.recentReflections) || "无"}`,
      `当前时间戳：${input.now ?? Date.now()}`,
    ].join("\n"),
    systemInstruction: `你正在写真实角色的私密第一人称心声，不是在写搜索摘要。只输出1—3句、15—100字中文。要体现角色为什么偏偏现在搜索、看到了什么马上有用、还在犹豫什么或准备怎么做；允许停顿、自我纠正、克制或情绪化，但必须符合人设和当下关系。不要机械复述搜索词，不要写成百科、鸡汤、心理分析或“我搜索这个是为了……”固定句式。不要提及系统、模型、提示词、程序、模板或应用规则。必须与历史心声不同。`,
  };
}

export async function generateCharacterPhoneBrowserReflection(
  input: CharacterPhoneBrowserReflectionAiInput,
): Promise<string | null> {
  const settings = input.settings;
  if (!settings?.apiKey?.trim() || !settings.selectedModel?.trim()) return null;
  const prompt = buildCharacterPhoneBrowserReflectionAiPrompt(input);
  try {
    const response = await apiChat({
      message: prompt.message,
      history: [],
      systemInstruction: prompt.systemInstruction,
      apiKey: settings.apiKey,
      model: settings.selectedModel,
      apiEndpoint: settings.apiEndpoint,
      apiTemperature: settings.apiTemperature ?? 0.9,
      streamCompatible: settings.streamCompatible,
      purpose: "character_phone_generate",
      characterId: input.character.id,
    });
    return normalizeGeneratedText(response.text, input.recentReflections);
  } catch {
    return null;
  }
}
