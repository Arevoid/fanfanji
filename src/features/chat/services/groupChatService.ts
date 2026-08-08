import type { apiChat } from "../../../utils/apiHelper";
import type { Character, Message } from "../../../types";
import { requestAiReply } from "./aiReplyService";
import { createGroupCharacterMessage } from "./messageFactory";
import { cleanAiReplyText } from "./messageParser";
import { suppressCharacterEmoji } from "./characterEmojiPolicy";
import { matchGroupReplyMembers, parseGroupReplies } from "./groupReplyParser";
import type { AiChatRequest } from "./chatServiceTypes";

export async function generateGroupReplyCandidates(input: {
  requestAi: typeof apiChat;
  request: AiChatRequest;
  members: readonly Character[];
  groupId: string;
  disableBracketActions: boolean;
  createId: (index: number) => string;
  currentTime: () => number;
}): Promise<{ messages: Message[]; members: Character[] }> {
  const data = await requestAiReply(input.requestAi, input.request);
  if (!data?.text) return { messages: [], members: [] };
  const matched = matchGroupReplyMembers(parseGroupReplies(data.text), input.members);
  const valid = matched.map((item) => ({
    ...item,
    content: suppressCharacterEmoji(cleanAiReplyText(item.reply.content.trim(), input.disableBracketActions)),
  })).filter((item) => Boolean(item.content));
  return {
    members: valid.map((item) => item.member),
    messages: valid.map((item) => createGroupCharacterMessage({
      id: input.createId(item.index), characterId: input.groupId, senderId: item.member.id,
      content: item.content, timestamp: input.currentTime(),
    })),
  };
}
