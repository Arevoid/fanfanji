import type { apiChat } from "../../../utils/apiHelper";
import type { Character, Moment, MemoryItem, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { RelationshipNetworkNpc } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import { generateCharacterMomentPipeline } from "./characterMomentGenerationPipeline";
import type { RelationshipNetworkNpcMomentAutomationTrigger } from "./relationshipNetworkNpcAutomationService";

/**
 * Generates one public Moment for an NPC that has already been linked to a
 * chat character. The linked character keeps the stable relation/guard scope;
 * the NPC profile is overlaid only for prompt context and public attribution.
 */
export async function generateRelationshipNetworkNpcMoment(input: {
  npc: RelationshipNetworkNpc;
  sourceCharacter: Character;
  relationship: CharacterRelationship;
  characters: readonly Character[];
  moments: readonly Moment[];
  worldBookEntries: readonly WorldBookEntry[];
  knowledgeClaims: readonly KnowledgeClaim[];
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  topicHistory: Parameters<typeof generateCharacterMomentPipeline>[0]["topicHistory"];
  settings: UserSettings;
  activeIdentityId: string;
  occurredAt: number;
  requestAi: typeof apiChat;
  cleanAndExtractMoment: Parameters<typeof generateCharacterMomentPipeline>[0]["cleanAndExtractMoment"];
  characterExpressionPrompt: string;
  automationTrigger?: RelationshipNetworkNpcMomentAutomationTrigger;
}): Promise<Awaited<ReturnType<typeof generateCharacterMomentPipeline>>> {
  const { npc, sourceCharacter } = input;
  const npcCharacter: Character = {
    ...sourceCharacter,
    name: npc.name,
    remark: npc.name,
    avatar: npc.avatar || sourceCharacter.avatar,
    personality: npc.personality || sourceCharacter.personality || npc.summary,
    backstory: [
      `【关系网 NPC 档案】${npc.name}`,
      npc.summary ? `人物简介：${npc.summary}` : "",
      npc.role ? `身份/职业：${npc.role}` : "",
      npc.motivation ? `当前动机：${npc.motivation}` : "",
      npc.tags?.length ? `标签：${npc.tags.join("、")}` : "",
      sourceCharacter.backstory ? `【关联聊天角色公开资料】\n${sourceCharacter.backstory}` : "",
    ].filter(Boolean).join("\n\n"),
    relationshipNetworkNpcId: npc.id,
  };
  const scopedCharacters = input.characters.map((character) =>
    character.id === sourceCharacter.id ? npcCharacter : character);
  const generated = await generateCharacterMomentPipeline({
    ...input,
    characters: scopedCharacters,
    allowProfileDrivenPost: true,
    momentPromptHint: input.automationTrigger === "chat-event"
      ? "最近的聊天对话"
      : input.automationTrigger === "relationship-event"
        ? "最近确认的关系变化"
        : input.automationTrigger === "schedule"
          ? "按日常节奏分享近况"
          : undefined,
  });
  if (!generated.moment) return generated;

  const authorAvatar = npc.avatar || sourceCharacter.avatar;
  return {
    ...generated,
    moment: {
      ...generated.moment,
      characterId: sourceCharacter.id,
      relationId: input.relationship.id,
      ownerIdentityId: input.activeIdentityId,
      relationshipNetworkNpcId: npc.id,
      authorName: npc.name,
      authorAvatar,
      comments: generated.moment.comments.map((comment) => ({
        ...comment,
        authorName: npc.name,
        authorAvatar,
      })),
    },
    ...(generated.memory ? {
      memory: {
        ...generated.memory,
        characterId: sourceCharacter.id,
        relationId: input.relationship.id,
        content: `【${npc.name}发布的朋友圈】${generated.moment.content}${generated.moment.image ? "（发布时附有配图）" : ""}`,
      },
    } : {}),
  };
}
