import type { Character, MemoryItem, Message, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { GroupChatTurnGenerator } from "./groupChatService";
import { buildGroupChatHistoryContext, buildGroupMemberPromptContexts, generateIsolatedGroupChatReplies } from "./groupChatService";
import { buildWorldBookSystemBlocks } from "../../../utils/worldBook";
import { formatLocalTimeContext } from "../../../domain/prompt/timeContext";
import { formatCharacterKnowledgeBoundary } from "../../../domain/prompt/characterKnowledgeBoundary";

export interface GroupChatReplyPipelineInput {
  activeCharacter: Character;
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  activeIdentityId: string;
  memories: readonly MemoryItem[];
  claims: Parameters<typeof buildGroupMemberPromptContexts>[0]["claims"];
  summaries: Parameters<typeof buildGroupMemberPromptContexts>[0]["summaries"];
  corrections: Parameters<typeof buildGroupMemberPromptContexts>[0]["corrections"];
  worldBookEntries: WorldBookEntry[];
  currentMessages: readonly Message[];
  userMessage: Message | null;
  customHistoryOverride?: Message[];
  userName: string;
  userBio?: string;
  settings: UserSettings;
  recallLimit: number;
  timeAwarenessEnabled: boolean;
  disableBracketActions: boolean;
  generateTurn: GroupChatTurnGenerator;
  createRouteId: () => string;
  createReplyId: () => string;
  currentTime: () => number;
  signal?: AbortSignal;
}

/** Prepares relation-safe group context and generates isolated member replies. */
export async function runGroupChatReplyPipeline(input: GroupChatReplyPipelineInput): Promise<{
  groupMembers: Character[];
  result: Awaited<ReturnType<typeof generateIsolatedGroupChatReplies>>;
}> {
  const groupMembers = (input.activeCharacter.memberIds || [])
    .map((id) => input.characters.find((character) => character.id === id))
    .filter(Boolean) as Character[];
  if (groupMembers.length === 0) return { groupMembers, result: null };

  const sourceMessages = input.customHistoryOverride
    || (input.userMessage ? [...input.currentMessages, input.userMessage] : [...input.currentMessages]);
  const { historyText, scanText } = buildGroupChatHistoryContext({
    sourceMessages,
    groupMembers,
    userName: input.userName,
    contextMemoryLimit: input.activeCharacter.contextMemoryLimit,
    scanMessage: input.userMessage,
  });
  const groupWorldBookBlocks = buildWorldBookSystemBlocks(input.worldBookEntries, input.activeCharacter.id, scanText, {
    scenario: "group",
    characterId: input.activeCharacter.id,
  });
  let groupWorldContext = groupWorldBookBlocks.formattedAll
    ? `\n\n【微信群组整体背景设定 / 共同世界书规则】：\n${groupWorldBookBlocks.formattedAll}\n`
    : "";
  if (input.timeAwarenessEnabled) groupWorldContext += `\n【当前现实时间】\n${formatLocalTimeContext()}\n`;
  groupWorldContext += `\n${formatCharacterKnowledgeBoundary({
    currentCharacterId: input.activeCharacter.id,
    groupMemberIds: groupMembers.map((member) => member.id),
  })}\n`;

  const memberContexts = buildGroupMemberPromptContexts({
    groupMembers,
    worldBookEntries: input.worldBookEntries,
    scanText,
    groupWorldBookBlocks,
    characters: input.characters,
    relationships: input.relationships,
    activeIdentityId: input.activeIdentityId,
    memories: input.memories,
    claims: input.claims,
    summaries: input.summaries,
    corrections: input.corrections,
    recallLimit: input.recallLimit,
    userName: input.userName,
  });
  const result = await generateIsolatedGroupChatReplies({
    userName: input.userName,
    userBio: input.userBio,
    groupName: input.activeCharacter.name,
    groupId: input.activeCharacter.id,
    settings: input.settings,
    groupMembers,
    worldBookEntries: input.worldBookEntries,
    groupWorldBookBlocks,
    groupWorldContext,
    historyText,
    hasUserMessage: Boolean(input.userMessage),
    ...memberContexts,
    publicMemberDefinitions: memberContexts.publicMemberDefinitions,
    disableBracketActions: input.disableBracketActions,
    generateTurn: input.generateTurn,
    createRouteId: input.createRouteId,
    createReplyId: input.createReplyId,
    currentTime: input.currentTime,
    signal: input.signal,
  });
  return { groupMembers, result };
}
