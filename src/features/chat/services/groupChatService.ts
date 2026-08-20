import type { apiChat } from "../../../utils/apiHelper";
import type { Character, MemoryItem, Message, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { requestAiReply } from "./aiReplyService";
import { createGroupCharacterMessage } from "./messageFactory";
import { cleanAiReplyText, normalizePaymentMarkup } from "./messageParser";
import { suppressCharacterEmoji } from "./characterEmojiPolicy";
import { matchGroupReplyMembers, parseGroupReplies } from "./groupReplyParser";
import type { AiChatRequest } from "./chatServiceTypes";
import { serializeMessageContentForPrompt } from "../prompts/messagePromptSerializer";
import { buildWorldBookSystemBlocks } from "../../../utils/worldBook";
import { buildGroupMemberPrivateContext, type GroupMemberPrivateContextInput } from "../prompts/groupMemberPrivateContext";
import { buildGroupChatSystemInstruction, buildGroupChatTaskMessage } from "../prompts/chatPromptBuilders";
import { buildIsolatedGroupMemberDefinitions } from "../prompts/groupMemberPrivateContext";
import { getVisibleWorldBookEntries } from "../../../utils/worldBook";
import { formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage } from "../../../domain/prompt/characterLanguage";

export type GroupChatTurnGenerator = (input: {
  prompt: {
    scenario: "group-chat";
    message: string;
    history: [];
    systemInstruction: string;
    historyInjections: ReturnType<typeof buildWorldBookSystemBlocks>["at_depth"];
  };
  settings: UserSettings;
  members: readonly Character[];
  groupId: string;
  disableBracketActions: boolean;
  createId: (index: number) => string;
  currentTime: () => number;
  signal?: AbortSignal;
}) => Promise<{ messages: Message[]; members: Character[] }>;

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
  const limit = Math.min(50, input.contextMemoryLimit !== undefined ? input.contextMemoryLimit : 20);
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
}): Promise<{ messages: Message[]; members: Character[] } | null> {
  const routerResult = await input.generateTurn({
    prompt: {
      scenario: "group-chat",
      message: `${buildGroupChatTaskMessage(input.historyText, input.hasUserMessage)}\n\n【本轮仅选择发言人】不要撰写正式回复。请选择本轮最自然会发言的 0—3 位成员，每位只输出占位内容“SELECT”，格式仍为 [SENDER_NAME: 角色原名]。`,
      history: [],
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

  const selectedMembers = Array.from(new Map(routerResult.members.map((member) => [member.id, member])).values()).slice(0, 3);
  const messages: Message[] = [];
  const members: Character[] = [];
  let sameTurnPublicHistory = input.historyText;
  for (const member of selectedMembers) {
    if (input.signal?.aborted) return null;
    const publicDefinition = input.publicMemberDefinitions[input.groupMembers.findIndex((candidate) => candidate.id === member.id)] || "";
    const memberDefinitions = buildIsolatedGroupMemberDefinitions({
      publicDefinition,
      publicRoster: input.groupMembers.map((candidate) => candidate.name),
      privateContext: input.privateContextByMemberId.get(member.id) || "",
    });
    const memberLanguageInstruction = formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(
      member,
      [
        publicDefinition,
        ...getVisibleWorldBookEntries(input.worldBookEntries, member.id, { scenario: "group", characterId: member.id })
          .map((entry) => `${entry.title}\n${entry.content}`),
      ],
    ));
    const isolatedDepthInjections = new Map(input.groupWorldBookBlocks.at_depth.map((entry) => [entry.sourceId, entry]));
    (input.memberAtDepthInjections.get(member.id) || []).forEach((entry) => isolatedDepthInjections.set(entry.sourceId, entry));
    const memberResult = await input.generateTurn({
      prompt: {
        scenario: "group-chat",
        message: `${buildGroupChatTaskMessage(sameTurnPublicHistory, input.hasUserMessage)}\n\n【单成员生成】本次请求只允许 ${member.name} 发言。可以保持沉默；若发言，每一条都必须使用 [SENDER_NAME: ${member.name}]，不得代替其他成员输出。`,
        history: [],
        systemInstruction: `${buildGroupChatSystemInstruction({
          userName: input.userName,
          userBio: input.userBio,
          groupName: input.groupName,
          worldContext: input.groupWorldContext,
          memberDefinitions,
        })}\n\n---\n\n${memberLanguageInstruction}`,
        historyInjections: [...isolatedDepthInjections.values()],
      },
      settings: input.settings,
      members: [member],
      groupId: input.groupId,
      disableBracketActions: input.disableBracketActions,
      createId: input.createReplyId,
      currentTime: input.currentTime,
      signal: input.signal,
    });
    if (input.signal?.aborted) return null;
    messages.push(...memberResult.messages);
    members.push(...memberResult.members);
    if (memberResult.messages.length > 0) {
      sameTurnPublicHistory = [
        sameTurnPublicHistory,
        ...memberResult.messages.map((message) => `${member.remark || member.name}: ${serializeMessageContentForPrompt(message, { mode: "history", userName: input.userName, characterName: member.remark || member.name })}`),
      ].filter(Boolean).join("\n");
    }
  }
  return { messages, members };
}

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
    content: normalizePaymentMarkup(suppressCharacterEmoji(cleanAiReplyText(item.reply.content.trim(), input.disableBracketActions))),
  })).filter((item) => Boolean(item.content));
  return {
    members: valid.map((item) => item.member),
    messages: valid.map((item) => createGroupCharacterMessage({
      id: input.createId(item.index), characterId: input.groupId, senderId: item.member.id,
      conversationId: `group:${input.groupId}`,
      content: item.content, timestamp: input.currentTime(),
    })),
  };
}
