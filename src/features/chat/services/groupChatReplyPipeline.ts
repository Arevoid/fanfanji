import type { Character, MemoryItem, Message, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { GroupChatTurnGenerator } from "./groupChatService";
import { buildGroupChatHistoryContext, buildGroupMemberPromptContexts, generateIsolatedGroupChatReplies } from "./groupChatService";
import { buildWorldBookSystemBlocks } from "../../../utils/worldBook";
import { formatLocalTimeContext } from "../../../domain/prompt/timeContext";
import { formatCharacterKnowledgeBoundary } from "../../../domain/prompt/characterKnowledgeBoundary";
import { buildSharedGroupMemoryContext } from "../prompts/sharedGroupMemoryContext";
import { buildMemoryContext } from "../../characterKnowledge/services/memoryContextGateway";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";

export interface GroupChatReplyPipelineInput {
  retrieveMemberMemory?: typeof buildMemoryContext;
  decideMemberAwareness?: Parameters<typeof generateIsolatedGroupChatReplies>[0]["decideMemberAwareness"];
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
  const { historyText, scanText, messages: promptedMessages } = buildGroupChatHistoryContext({
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
  if (input.activeCharacter.groupMemorySyncEnabled) groupWorldContext += buildSharedGroupMemoryContext({ groupId: input.activeCharacter.id,
    members: groupMembers, characters: input.characters, relationships: input.relationships, identityId: input.activeIdentityId,
    claims: input.claims, summaries: input.summaries, messages: sourceMessages, alreadyPromptedIds: promptedMessages.map((message) => message.id),
    query: input.userMessage?.content || sourceMessages.at(-1)?.content || "", limit: input.recallLimit });

  const truthContextByMemberId = new Map<string,string>();
  for (const member of groupMembers) {
    // Browser storage is the production source. Pure/server callers keep their
    // explicitly supplied source snapshot unless they inject a retrieval seam.
    if(typeof window==="undefined"&&!input.retrieveMemberMemory)continue;
    if (input.signal?.aborted) return { groupMembers, result: null };
    const relation = findRelationshipForCanonicalCharacter(input.relationships, input.activeIdentityId, member.id, input.characters);
    if (!relation) continue;
    try {
      const context = await (input.retrieveMemberMemory || buildMemoryContext)({ surface: "group",contextId:input.activeCharacter.id, relation, characterId: relation.characterId,
        userIdentityId: input.activeIdentityId, audience: "relation_private", settings: input.settings, query: scanText, maxCharacters: 1800 });
      truthContextByMemberId.set(member.id,context);
    } catch { /* Local source-checked recall still participates in the private decision. */ }
  }
  const memberContexts = buildGroupMemberPromptContexts({
    truthContextByMemberId,
    groupId: input.activeCharacter.id,
    groupMembers,
    worldBookEntries: input.worldBookEntries,
    scanText,
    groupWorldBookBlocks,
    characters: input.characters,
    relationships: input.relationships,
    activeIdentityId: input.activeIdentityId,
    claims: input.claims,
    summaries: input.summaries,
    corrections: input.corrections,
    recallLimit: input.recallLimit,
    userName: input.userName,
  });
  const result = await generateIsolatedGroupChatReplies({
    decideMemberAwareness: input.decideMemberAwareness,
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
    imageDataUrl: input.userMessage?.sender === "user" && /^data:image\//i.test(input.userMessage.content.trim())
      ? input.userMessage.content.trim()
      : undefined,
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
