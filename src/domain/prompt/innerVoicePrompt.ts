import type { Character, MemoryItem, Message } from "../../types";

export interface InnerVoicePromptInput {
  character: Character;
  currentMessage: Message;
  recentMessages: Message[];
  relevantMemories?: readonly MemoryItem[];
}

function formatMessage(message: Message, characterName: string): string {
  const speaker = message.sender === "user" ? "用户" : characterName;
  return `${speaker}：${message.content}`;
}

/** Builds a dedicated prompt without changing the ordinary chat prompt. */
export function buildInnerVoicePrompt({ character, currentMessage, recentMessages, relevantMemories = [] }: InnerVoicePromptInput): string {
  const name = character.remark || character.name;
  const history = recentMessages
    .slice(-12)
    .map((message) => formatMessage(message, name))
    .join("\n");
  const memories = relevantMemories.slice(0, 5).map((memory) => `- ${memory.content}`).join("\n");

  return [
    "你只负责生成角色未说出口的当下心理活动，不要回复用户，也不要续写聊天。",
    "请以角色第一人称写一小段自然、克制的内心独白；它不是分析报告、旁白、测谎结果或系统说明。",
    "只能使用角色设定和本段真实聊天中明确提供的信息。不要知道角色不知道的事，不要改写已发生事实，不要虚构关系升级、共同经历或隐藏事件。",
    "表面回复不必与心声相反；只有在聊天内容确实支持时，才表达犹豫、疲惫、安心或期待等情绪。",
    "state 是角色此刻的简短上下文状态，不限于单个情绪词；可以是动作或情境（如“在喝水，刚结束工作”），也可以是结合上下文的心情描述（如“委屈中带着一丝窃喜，她还记得我的习惯”）。不要写分析结论或脱离聊天的剧情。",
    "只返回合法 JSON，不要使用 Markdown 或额外解释：{\"state\":\"在喝水，刚结束工作\",\"content\":\"第一人称心声\"}",
    `\n[角色]\n姓名：${name}\n人设：${character.personality || "未提供"}\n背景：${character.backstory || "未提供"}`,
    `\n[当前触发消息]\n${formatMessage(currentMessage, name)}`,
    `\n[最近聊天上下文]\n${history || "无"}`,
    `\n[当前关系可用记忆]\n${memories || "无"}`,
  ].join("\n");
}
