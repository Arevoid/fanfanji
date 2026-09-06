import { apiChat } from "../../utils/apiHelper";
import type { Character, UserSettings } from "../../types";
import type {
  CharacterPhoneContact,
  CharacterPhoneRecord,
  CharacterPhoneThreadMessage,
} from "../../domain/characterPhone/types";

export interface CharacterPhoneContactReplyInput {
  phone: CharacterPhoneRecord;
  contact: CharacterPhoneContact;
  character: Character;
  /** A linked character gives the contact a real persona instead of a generic NPC voice. */
  contactCharacter?: Character;
  settings?: UserSettings;
  now?: number;
}

export interface CharacterPhoneContactReplyPrompt {
  message: string;
  systemInstruction: string;
  history: Array<{ role: "user" | "model"; text: string }>;
}

function trim(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function formatThreadMessage(
  message: CharacterPhoneThreadMessage,
  character: Character,
  contact: CharacterPhoneContact,
): string {
  return `${message.sender === "character" ? character.name : contact.remark || contact.name}：${trim(message.content, 500)}`;
}

/** Builds an isolated prompt for the role-phone conversation. */
export function buildCharacterPhoneContactReplyPrompt(
  input: CharacterPhoneContactReplyInput,
): CharacterPhoneContactReplyPrompt {
  const now = input.now ?? Date.now();
  const recentMessages = (input.phone.threadMessages ?? [])
    .filter((message) => message.contactId === input.contact.id && trim(message.content))
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-12);
  const contactName = input.contact.remark || input.contact.name;
  const contactProfile = input.contactCharacter
    ? `联系人资料：姓名“${input.contactCharacter.name}”；人设：${trim(input.contactCharacter.personality, 1200)}；背景：${trim(input.contactCharacter.backstory, 1200)}`
    : `联系人资料：姓名“${contactName}”；关系：${trim(input.contact.relation, 120)}。`;
  const transcript = recentMessages.length > 0
    ? recentMessages.map((message) => `- ${formatThreadMessage(message, input.character, input.contact)}`).join("\n")
    : "（这是刚建立的对话，还没有历史消息。）";
  const latest = recentMessages.at(-1);
  const latestMessage = latest && latest.sender === "character"
    ? trim(latest.content)
    : "（没有新的待回复消息。）";
  const groupRule = input.contact.kind === "group"
    ? "这是群聊；请以其中一位自然会先看到消息的群成员口吻回复，不要编造多个成员的长对话。"
    : "这是双方私聊；只生成联系人这一条回复。";
  return {
    message: `请生成角色手机聊天中联系人“${contactName}”看到新消息后的下一条短信。\n${contactProfile}\n发送消息的角色：${input.character.name}。\n关系：${trim(input.contact.relation, 120)}。\n当前时间戳：${now}。\n最近对话：\n${transcript}\n刚刚由角色发出的新消息：${latestMessage}\n${groupRule}`,
    systemInstruction: `你正在模拟真实的人“${contactName}”，回复${input.character.name}手机里的聊天。${groupRule}
只输出一条可以直接显示在聊天气泡里的纯文字回复，控制在 1—3 句、400 字以内。根据联系人资料、关系和上下文自然回应，可以简短、延迟感、说自己正在忙或稍后再聊，但这一次必须给出回复。
重要边界：这是角色与其好友的手机私聊，不是用户与${input.character.name}的主聊天。不要提及用户、模型、提示词、系统、马甲、代发、有人操作手机、账号异常或“下一次生活生成”；不要替${input.character.name}解释，也不要因为消息是由用户在角色手机里输入就立刻识破来源。把它当成${input.character.name}本人正常发来的消息。不要添加“联系人：”“回复：”等前缀，不要使用 Markdown 或 JSON。`,
    history: [],
  };
}

/** Normalizes provider output so an accidental wrapper never becomes a chat bubble. */
export function normalizeCharacterPhoneContactReply(value: unknown): string | null {
  let text = trim(value, 1200)
    .replace(/^```(?:text|plain)?\s*/iu, "")
    .replace(/```\s*$/u, "")
    .trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { reply?: unknown; text?: unknown };
    text = trim(parsed.reply ?? parsed.text, 1200) || text;
  } catch {
    // Plain text is the normal provider response.
  }
  text = text.replace(/^(?:联系人(?:回复)?|回复|消息)[：:]\s*/u, "").trim();
  return text ? text.slice(0, 1000) : null;
}

export async function generateCharacterPhoneContactReply(
  input: CharacterPhoneContactReplyInput,
): Promise<string | null> {
  const settings = input.settings;
  if (!settings?.apiKey?.trim() || !settings.selectedModel?.trim()) return null;
  const prompt = buildCharacterPhoneContactReplyPrompt(input);
  try {
    const response = await apiChat({
      message: prompt.message,
      history: prompt.history,
      systemInstruction: prompt.systemInstruction,
      apiKey: settings.apiKey,
      model: settings.selectedModel,
      apiEndpoint: settings.apiEndpoint,
      apiTemperature: settings.apiTemperature ?? 0.78,
      streamCompatible: settings.streamCompatible,
    });
    return normalizeCharacterPhoneContactReply(response.text);
  } catch {
    return null;
  }
}
