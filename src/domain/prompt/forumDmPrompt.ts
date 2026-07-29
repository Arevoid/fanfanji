import type { Character, ForumDmConversation, ForumDmMessage, ForumThread, UserSettings } from "../../types";

export const buildForumDmPrompt = (input: { conversation: ForumDmConversation; messages: readonly ForumDmMessage[]; thread?: ForumThread; character?: Character; profileName: string; settings: UserSettings }): { systemInstruction: string; message: string; history: Array<{ role: "user" | "assistant"; text: string }> } => {
  const persona = input.conversation.participant.kind === "relationship"
    ? `${input.character?.name || input.conversation.participantPublicSnapshot.displayName} 的公开人设：${(input.character?.personality || "自然、简短地交流").slice(0, 700)}`
    : `你是论坛用户 ${input.conversation.participantPublicSnapshot.displayName}，保持普通论坛用户的语气。`;
  const origin = input.thread ? `私信起因是公开论坛帖《${input.thread.title}》：${input.thread.body.slice(0, 700)}` : "没有额外论坛上下文。";
  return {
    systemInstruction: `${persona}\n${origin}\n你正在论坛私信中和 ${input.profileName || "用户"} 交流。只输出自然、简短的纯文本回复；禁止括号动作、舞台说明、时间标记、表情包、图片、语音、附件和任何“已发送媒体”叙述。不要提及系统、关系 ID 或后台数据。`,
    message: "请回复对方刚发来的这条论坛私信。",
    history: input.messages.slice(-30).map((message) => ({ role: message.sender === "user" ? "user" : "assistant", text: message.body })),
  };
};
