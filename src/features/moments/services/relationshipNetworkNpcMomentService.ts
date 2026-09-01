import type { apiChat } from "../../../utils/apiHelper";
import type { Character, Moment, MemoryItem, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { RelationshipNetworkNpc } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import { generateCharacterMomentPipeline } from "./characterMomentGenerationPipeline";
import type { RelationshipNetworkNpcMomentAutomationTrigger } from "./relationshipNetworkNpcAutomationService";
import {
  getRelationshipNetworkNpcActorCharacterId,
  resolveRelationshipNetworkNpcActor,
} from "../../../domain/relationshipNetwork/relationshipNetworkNpcActor";

/**
 * Generates one public Moment for an NPC. A full chat profile is optional: a
 * lightweight NPC receives a stable in-memory actor so it can use its own
 * profile without being promoted first.
 */
export async function generateRelationshipNetworkNpcMoment(input: {
  npc: RelationshipNetworkNpc;
  sourceCharacter?: Character;
  relationship?: CharacterRelationship;
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
  const actor = resolveRelationshipNetworkNpcActor({
    npc: input.npc,
    ownerIdentityId: input.activeIdentityId,
    characters: input.characters,
    relationships: input.relationship ? [input.relationship] : [],
    preferredCharacterId: input.sourceCharacter?.id,
    preferredRelationId: input.relationship?.id,
  });
  const { npc } = input;
  const { character: sourceCharacter, relationship } = actor;
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
      sourceCharacter.id !== getRelationshipNetworkNpcActorCharacterId(npc.id) && sourceCharacter.backstory
        ? `【完整角色档案资料】\n${sourceCharacter.backstory}`
        : "",
    ].filter(Boolean).join("\n\n"),
    relationshipNetworkNpcId: npc.id,
  };
  const charactersWithActor = input.characters.some((character) => character.id === sourceCharacter.id)
    ? input.characters
    : [...input.characters, sourceCharacter];
  const scopedCharacters = charactersWithActor.map((character) =>
    character.id === sourceCharacter.id ? npcCharacter : character);
  const generated = await generateCharacterMomentPipeline({
    ...input,
    relationship,
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
      relationId: relationship.id,
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
        relationId: relationship.id,
        content: `【${npc.name}发布的朋友圈】${generated.moment.content}${generated.moment.image ? "（发布时附有配图）" : ""}`,
      },
    } : {}),
  };
}
