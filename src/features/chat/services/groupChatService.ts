import type { apiChat } from "../../../utils/apiHelper";
import type { Character, MemoryItem, Message, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { requestAiReply } from "./aiReplyService";
import { createGroupCharacterMessage } from "./messageFactory";
import { containsNonChineseText } from "../../../utils/textLanguage";
import { cleanAiReplyText, normalizePaymentMarkup } from "./messageParser";
import { suppressCharacterEmoji } from "./characterEmojiPolicy";
import { matchGroupReplyMembers, parseGroupReplies } from "./groupReplyParser";
import type { AiChatRequest } from "./chatServiceTypes";
import { serializeMessageContentForPrompt } from "../prompts/messagePromptSerializer";
import { buildWorldBookSystemBlocks } from "../../../utils/worldBook";
import { buildGroupMemberPrivateContext, type GroupMemberPrivateContextInput } from "../prompts/groupMemberPrivateContext";
import { buildGroupChatSystemInstruction, buildGroupChatTaskMessage } from "../prompts/chatPromptBuilders";
import { INLINE_GROUP_INNER_VOICE_INSTRUCTION, parseGroupTurnResponse } from "./chatTurnResponseProtocol";
import { DEFAULT_CHAT_CONTEXT_MEMORY_LIMIT, MAX_CHAT_CONTEXT_MEMORY_LIMIT } from "./chatMemoryRetrievalSettings";

export type GroupChatTurnGenerator = (input: {
  prompt: {
    scenario: "group-chat";
    message: string;
    history: [];
    systemInstruction: string;
    imageDataUrl?: string;
    historyInjections: ReturnType<typeof buildWorldBookSystemBlocks>["at_depth"];
  };
  settings: UserSettings;
  members: readonly Character[];
  groupId: string;
  disableBracketActions: boolean;
  createId: (index: number) => string;
  currentTime: () => number;
  signal?: AbortSignal;
}) => Promise<{ messages: Message[]; members: Character[]; innerVoices?: Array<{ message: Message; member: Character; content: { content: string; emotionalState: string; translation?: string } }> }>;

export function buildGroupChatHistoryContext(input: {
  sourceMessages: readonly Message[];
  groupMembers: readonly Character[];
  userName: string;
  contextMemoryLimit?: number;
  scanMessage?: Message | null;
}): { messages: Message[]; historyText: string; scanText: string } {
  const uniqueMessages = new Map<string, Message>();
  input.sourceMessages.forEach((message) => {
    if (message) uniqueMessages.set(message.id, message);
  });
  const finalMessages = Array.from(uniqueMessages.values()).sort((left, right) => left.timestamp - right.timestamp);
  const limit = Math.min(MAX_CHAT_CONTEXT_MEMORY_LIMIT, input.contextMemoryLimit !== undefined ? input.contextMemoryLimit : DEFAULT_CHAT_CONTEXT_MEMORY_LIMIT);
  const messages = finalMessages.slice(-limit);
  const historyText = messages.map((message) => {
    const senderCharacter = message.sender === "character"
      ? input.groupMembers.find((character) => character.id === message.senderId)
      : undefined;
    const senderName = message.sender === "user"
      ? input.userName
      : senderCharacter ? (senderCharacter.remark || senderCharacter.name) : (message.senderId || "成员");
    const content = serializeMessageContentForPrompt(message, {
      mode: "history",
      userName: input.userName,
      characterName: senderName,
    });
    return message.sender === "user"
      ? `${input.userName} (机主): ${content}`
      : `${senderName}: ${content}`;
  }).join("\n");
  const scanText = [input.scanMessage, ...messages]
    .filter((message): message is Message => Boolean(message))
    .slice(-10)
    .map((message) => serializeMessageContentForPrompt(message, { mode: "history", userName: input.userName }))
    .filter(Boolean)
    .join("\n");
  return { messages, historyText, scanText };
}

export function buildGroupMemberPromptContexts(input: {
  groupMembers: readonly Character[];
  worldBookEntries: WorldBookEntry[];
  scanText: string;
  groupWorldBookBlocks: ReturnType<typeof buildWorldBookSystemBlocks>;
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  activeIdentityId: string;
  memories: readonly MemoryItem[];
  claims: GroupMemberPrivateContextInput["claims"];
  summaries: GroupMemberPrivateContextInput["summaries"];
  corrections: GroupMemberPrivateContextInput["corrections"];
  recallLimit: number;
  userName: string;
}): {
  groupAtDepthInjections: Map<string, ReturnType<typeof buildWorldBookSystemBlocks>["at_depth"][number]>;
  memberAtDepthInjections: Map<string, ReturnType<typeof buildWorldBookSystemBlocks>["at_depth"]>;
  privateContextByMemberId: Map<string, string>;
  publicMemberDefinitions: string[];
} {
  const groupAtDepthInjections = new Map(input.groupWorldBookBlocks.at_depth.map((entry) => [entry.sourceId, entry]));
  const memberAtDepthInjections = new Map<string, ReturnType<typeof buildWorldBookSystemBlocks>["at_depth"]>();
  const includedWorldBookEntryIds = new Set(input.groupWorldBookBlocks.allTriggered.map((entry) => entry.id));
  const privateContextByMemberId = new Map<string, string>();
  const publicMemberDefinitions = input.groupMembers.map((member, index) => {
    const memberWorldBookBlocks = buildWorldBookSystemBlocks(input.worldBookEntries, member.id, input.scanText, {
      scenario: "group",
      characterId: member.id,
    });
    memberWorldBookBlocks.at_depth.forEach((entry) => groupAtDepthInjections.set(entry.sourceId, entry));
    memberAtDepthInjections.set(member.id, memberWorldBookBlocks.at_depth);
    const memberOnlyWorldBook = memberWorldBookBlocks.allTriggered
      .filter((entry) => entry.position !== "at_depth" && !includedWorldBookEntryIds.has(entry.id));
    memberOnlyWorldBook.forEach((entry) => includedWorldBookEntryIds.add(entry.id));
    const privateContext = buildGroupMemberPrivateContext({
      member,
      characters: input.characters,
      relationships: input.relationships,
      activeIdentityId: input.activeIdentityId,
      memories: input.memories,
      claims: input.claims,
      summaries: input.summaries,
      corrections: input.corrections,
      queryText: input.scanText,
      limit: input.recallLimit,
      alreadyPromptedTexts: input.scanText ? [input.scanText] : [],
    });
    if (privateContext) privateContextByMemberId.set(member.id, privateContext);
    const memberWorldBookText = memberOnlyWorldBook.length
      ? `\n- 该角色专属世界书背景/日程/时间线设定:\n${memberOnlyWorldBook.map((entry) => `【设定 - ${entry.title}】\n${entry.content}`).join("\n\n")}`
      : "";
    return `[群聊成员 ${index + 1}: ${member.name}]
- 角色人设/性格: ${member.personality}
- 背景设定: ${member.backstory}
- 与机主(${input.userName})的关系: 根据人设及世界观设定
${memberWorldBookText}`;
  });
  return { groupAtDepthInjections, memberAtDepthInjections, privateContextByMemberId, publicMemberDefinitions };
}

export async function generateIsolatedGroupChatReplies(input: {
  userName: string;
  userBio?: string;
  groupName: string;
  groupId: string;
  settings: UserSettings;
  groupMembers: readonly Character[];
  worldBookEntries: WorldBookEntry[];
  groupWorldBookBlocks: ReturnType<typeof buildWorldBookSystemBlocks>;
  groupWorldContext: string;
  historyText: string;
  imageDataUrl?: string;
  hasUserMessage: boolean;
  groupAtDepthInjections: Map<string, ReturnType<typeof buildWorldBookSystemBlocks>["at_depth"][number]>;
  memberAtDepthInjections: Map<string, ReturnType<typeof buildWorldBookSystemBlocks>["at_depth"]>;
  privateContextByMemberId: Map<string, string>;
  publicMemberDefinitions: string[];
  disableBracketActions: boolean;
  generateTurn: GroupChatTurnGenerator;
  createRouteId: () => string;
  createReplyId: () => string;
  currentTime: () => number;
  signal?: AbortSignal;
}): Promise<{ messages: Message[]; members: Character[]; innerVoices?: Array<{ message: Message; member: Character; content: { content: string; emotionalState: string; translation?: string } }> } | null> {
  // One request is intentionally used for the whole public group turn. Sending
  // one request per member was expensive and also made the first-turn delivery
  // look stuck while several sequential calls were in flight. Private member
  // contexts are not merged here: doing so would expose one member's private
  // memory to another member in the same model request.
  const result = await input.generateTurn({
    prompt: {
      scenario: "group-chat",
      message: `${buildGroupChatTaskMessage(input.historyText, input.hasUserMessage)}\n\n【群聊本轮回复】本轮至少让 1 位成员实际发言；每位成员最多发送 6 条独立短消息，不限制整轮总消息数。请根据群成员各自的人设、关系、上下文剧情、时间状态和当前话题自然判断哪些成员发言、各发几条，不能固定为 3 人，也不能返回空回复。每条回复必须以 [SENDER_NAME: 角色原名] 开头；同一成员的每条消息都必须重复自己的发送者标签。不得替其他成员发言，不得输出群外角色。若上下文中存在红包，必须先为每个成员独立判断 redPacketAction，再决定是否生成可见发言：claim_and_reply=先领取并发言，claim_silent=先领取但潜水不发言，decline_and_reply=不领取但发言，silent=不领取且不发言。领取动作必须基于红包对象、专属限制、角色人设和当前剧情判断，不能因为“快点领/不许领/别领”等话术误触发。红包可以跨越多轮对话继续存在：如果历史中有尚未领取且仍未过期的红包，成员可以本轮先和其他人聊天后再领取，也可以隔几轮看到后再领取；不要因为中间出现了其他消息就忽略它。${INLINE_GROUP_INNER_VOICE_INSTRUCTION}${input.groupMembers.some((member) => member.enableAutoTranslate) ? "\n群内开启了全部翻译的成员必须同时提供 translation 字段，并保持对应回复的气泡结构。" : ""}`,
      history: [],
      ...(input.imageDataUrl ? { imageDataUrl: input.imageDataUrl } : {}),
      systemInstruction: buildGroupChatSystemInstruction({
        userName: input.userName,
        userBio: input.userBio,
        groupName: input.groupName,
        worldContext: input.groupWorldContext,
        memberDefinitions: input.publicMemberDefinitions.join("\n\n"),
      }),
      historyInjections: [...input.groupAtDepthInjections.values()],
    },
    settings: input.settings,
    members: input.groupMembers,
    groupId: input.groupId,
    disableBracketActions: input.disableBracketActions,
    createId: input.createRouteId,
    currentTime: input.currentTime,
    signal: input.signal,
  });
  if (input.signal?.aborted) return null;
  return result;
}

export async function generateGroupReplyCandidates(input: {
  requestAi: typeof apiChat;
  request: AiChatRequest;
  members: readonly Character[];
  groupId: string;
  disableBracketActions: boolean;
  createId: (index: number) => string;
  currentTime: () => number;
}): Promise<{ messages: Message[]; members: Character[]; innerVoices?: Array<{ message: Message; member: Character; content: { content: string; emotionalState: string; translation?: string } }> }> {
  const data = await requestAiReply(input.requestAi, input.request);
  if (!data?.text) return { messages: [], members: [] };
  const structured = parseGroupTurnResponse(data.text);
  const rawReplies = structured
    ? structured.map((reply) => ({ charName: reply.sender, content: reply.content }))
    : parseGroupReplies(data.text);
  const matched = matchGroupReplyMembers(rawReplies, input.members);
  const valid = matched.map((item) => ({
    ...item,
    structuredReply: structured?.find((reply) => reply.sender.toLowerCase() === item.member.name.toLowerCase()
      || (item.member.remark && reply.sender.toLowerCase() === item.member.remark.toLowerCase())),
    content: normalizePaymentMarkup(suppressCharacterEmoji(cleanAiReplyText(item.reply.content.trim(), input.disableBracketActions))),
  })).filter((item) => Boolean(item.content) || item.structuredReply?.redPacketAction === "claim_silent" || item.structuredReply?.redPacketAction === "silent");
  const messages = valid.map((item) => createGroupCharacterMessage({
    id: input.createId(item.index), characterId: input.groupId, senderId: item.member.id,
    conversationId: `group:${input.groupId}`,
    content: item.content, timestamp: input.currentTime(),
    translation: containsNonChineseText(item.content) ? item.structuredReply?.translation : undefined,
    redPacketAction: item.structuredReply?.redPacketAction,
  }));
  return {
    members: valid.map((item) => item.member),
    messages,
    innerVoices: structured ? valid.flatMap((item, index) => {
      const structuredReply = structured.find((reply) => reply.sender.toLowerCase() === item.member.name.toLowerCase()
        || (item.member.remark && reply.sender.toLowerCase() === item.member.remark.toLowerCase()));
      return structuredReply?.innerVoice && messages[index]
      && messages[index].redPacketAction !== "claim_silent"
      && messages[index].redPacketAction !== "silent"
      ? [{ message: messages[index], member: item.member, content: structuredReply.innerVoice }]
      : [];
    }) : [],
  };
}
