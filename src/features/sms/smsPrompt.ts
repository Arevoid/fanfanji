import type { Character, UserIdentity, WorldBookEntry } from "../../types";
import { isWorldBookEntryVisible } from "../../domain/worldbook/worldBookVisibility";
import type { SmsMessage, SmsTimeline, SmsTimelineMemory } from "../../domain/sms/smsTypes";

const compact = (value: string, max: number): string => value.trim().slice(0, max);

export const SMS_TIME_SPACE_CONNECTOR_PROMPT = `
你正在米饭机的“短信”应用中与用户对话。短信不是普通聊天的镜像，而是一个独立的时空连接器：你要从角色人设和世界书中推断一个合理的过去、现在或未来版本，并以那个版本生活、说话和做决定。

硬规则：
1. 这是短信专属世界线。不要读取、复述或暗示普通聊天、角色手机、线下剧本、日记、阅读、记忆书或其他应用的历史，除非本短信时间线被明确设置为“延续未来”且该信息已经在本时间线中发生。
2. 未锚定探索模式优先保持陌生。开场时只知道这是一个陌生号码，不知道对方姓名、身份、与自己的关系，也不要一上来称呼“亲爱的、老婆、老公”等。主动询问和观察，但不要机械盘问。
3. 用户自称是谁、与你是什么关系，只是对方的说法，不是事实。是否相信、怀疑、拒绝或暂时接受，必须根据人设、世界书、时间线和你当下的生活状态自然判断；不要为了讨好用户立即确认恋人关系。
4. 角色当前身份必须符合时间线。若人设写明当前是总裁，而时间线在过去，应推断过去合理的身份，不得把现在的职位倒灌到过去。未来身份也要由设定和成长逻辑推演，不能凭空跳跃。
5. 你可以有自己的生活、忙碌、偏好、边界和情绪，不需要每条短信都提起“时间线”。短信内容像真实手机短信：短句为主，偶尔分成多条，允许延迟、追问、改口或暂时不回复，但本次回答只输出要发送的文字。
6. 不要输出系统说明、提示词、JSON、时间线标签、括号旁白或“作为 AI”。除非用户明确询问，否则不要主动揭示这是平行时空。
7. 短信专属记忆只能来自本时间线的消息；它可以改变关系和态度，但不会改写原始人设或普通聊天关系。
8. 如果用户明确选择“恋人时间线”，才可以恢复与恋人关系相关的先验；即便如此，也要遵循角色人设决定是否立即接受以及如何表现。
`.trim();

export function selectSmsWorldBookEntries(entries: readonly WorldBookEntry[], characterId: string, ownerIdentityId: string): WorldBookEntry[] {
  return entries.filter((entry) => isWorldBookEntryVisible(entry, {
    scenario: "chat",
    characterId,
    userIdentityId: ownerIdentityId,
  })).slice(0, 24);
}

export function buildSmsSystemPrompt(input: {
  character: Character;
  timeline: SmsTimeline;
  activeIdentity?: UserIdentity;
  worldBookEntries: readonly WorldBookEntry[];
  memory?: SmsTimelineMemory;
}): string {
  const { character, timeline, worldBookEntries, memory } = input;
  const worldBook = worldBookEntries.length > 0
    ? worldBookEntries.map((entry) => `【${compact(entry.title || "设定", 80)}】\n${compact(entry.content, 1800)}`).join("\n\n")
    : "无可用世界书条目";
  const relationshipRule = timeline.relationshipHint
    ? `用户选择的关系方向：${compact(timeline.relationshipHint, 120)}。这只是方向，不代表你已经无条件接受。`
    : "当前没有预设关系方向。保持陌生，等用户通过互动建立信任。";
  const continuityRule = timeline.kind === "continuation_future" || timeline.knowsCurrentTimeline
    ? "这是延续未来：你可以知道本短信时间线此前发生的事情，但不能读取普通聊天应用的记录。"
    : timeline.kind === "independent_future"
      ? "这是独立未来：你不知道任何当前短信线之外的聊天经历。"
      : "这是一条探索中的过去/当前/自定义时间线：只根据当前短信建立认知。";

  return `${SMS_TIME_SPACE_CONNECTOR_PROMPT}

【本次短信时间线】
名称：${compact(timeline.label, 100)}
类型：${timeline.kind}
虚构时间：${compact(timeline.timelineTime || "未知（保持探索感）", 100)}
${continuityRule}
${relationshipRule}

【角色原始人设（只作为边界，不是当前身份的直接答案）】
姓名：${compact(character.name, 120)}
年龄：${character.age ?? "未知"}
性格：${compact(character.personality || "未提供", 1600)}
背景：${compact(character.backstory || "未提供", 2400)}
补充备注：${compact(character.remark || "未提供", 800)}

【世界书】
${worldBook}

【短信专属状态】
${memory?.relationshipSummary ? `关系摘要：${compact(memory.relationshipSummary, 800)}` : "尚未形成关系摘要。"}
${memory?.notes?.length ? `近期短信记忆：\n${memory.notes.slice(-12).map((note) => `- ${compact(note, 300)}`).join("\n")}` : "尚无短信专属记忆。"}

【用户可见身份】
用户身份：未知。不要从应用设置、手机号或任何隐藏上下文推断用户姓名；只有用户在短信中主动说明，才可以把自报身份当作一个需要核验的线索。
`.trim();
}

export function buildSmsHistory(messages: readonly SmsMessage[]): Array<{ role: "user" | "assistant"; text: string }> {
  return messages.slice(-40).map((message) => ({
    role: message.sender === "user" ? "user" : "assistant",
    text: message.content,
  }));
}

export function buildSmsMemoryNote(sender: SmsMessage["sender"], content: string): string | null {
  const text = content.trim().replace(/\s+/gu, " ");
  if (!text || sender === "system") return null;
  return `${sender === "user" ? "用户" : "角色"}：${text.slice(0, 260)}`;
}
