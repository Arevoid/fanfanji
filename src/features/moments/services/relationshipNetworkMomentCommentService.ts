import type { Character, MemoryItem, Moment, MomentComment, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { DEFAULT_IDENTITY_ID } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import type {
  RelationshipNetworkInteractionAction,
  RelationshipNetworkMomentCommentFrequency,
  RelationshipNetworkNpc,
  RelationshipNetworkSocialLink,
} from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import { listRelationshipNetworkChatLinksForIdentity } from "../../../core/storage/repositories/relationshipNetworkChatLinkRepository";
import { listRelationshipNetworkNpcsForIdentity } from "../../../core/storage/repositories/relationshipNetworkRepository";
import { listRelationshipNetworkSocialLinksForIdentity } from "../../../core/storage/repositories/relationshipNetworkSocialLinkRepository";
import { getMomentComments } from "./momentContent";
import { generateAutomaticMomentComment } from "./automaticMomentCommentPipeline";
import { generateAutomaticMomentReply } from "./automaticMomentReplyPipeline";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import type { apiChat } from "../../../utils/apiHelper";

const MOMENT_CADENCE_BY_FREQUENCY: Record<RelationshipNetworkMomentCommentFrequency, number> = {
  low: 3,
  normal: 2,
  high: 1,
};

const belongsToIdentity = (character: Character, ownerIdentityId: string): boolean =>
  (character.ownerIdentityId || DEFAULT_IDENTITY_ID) === ownerIdentityId;

export interface RelationshipNetworkMomentCommentCandidate {
  socialLink: RelationshipNetworkSocialLink;
  npc: RelationshipNetworkNpc;
  sourceCharacter: Character;
  sourceRelationship: CharacterRelationship;
  targetEntityType: "character" | "identity";
  targetEntityId: string;
  targetCharacter?: Character;
  targetIdentityId?: string;
  targetIdentityName?: string;
  replyingTo?: MomentComment;
}

function findSourceCharacter(
  npc: RelationshipNetworkNpc,
  linkedCharacterId: string | undefined,
  characters: readonly Character[],
  ownerIdentityId: string,
): Character | undefined {
  const linkedCharacter = linkedCharacterId
    ? characters.find((character) => character.id === linkedCharacterId && belongsToIdentity(character, ownerIdentityId))
    : undefined;
  if (linkedCharacter) return linkedCharacter;

  return characters.find((character) =>
    belongsToIdentity(character, ownerIdentityId) && character.relationshipNetworkNpcId === npc.id,
  );
}

function hasSourceCommented(
  moment: Moment,
  sourceCharacterId: string,
  sourceRelationId: string,
): boolean {
  return getMomentComments(moment).some((comment) =>
    comment.relationId === sourceRelationId || comment.characterId === sourceCharacterId,
  );
}

function hasSourceLiked(moment: Moment, sourceDisplayName: string): boolean {
  return moment.likes.includes(sourceDisplayName);
}

function hasSourceRepliedToComment(
  moment: Moment,
  sourceCharacterId: string,
  sourceRelationId: string,
  targetCommentId: string,
): boolean {
  return getMomentComments(moment).some((comment) =>
    comment.replyToCommentId === targetCommentId
    && (comment.relationId === sourceRelationId || comment.characterId === sourceCharacterId),
  );
}

/**
 * The frequency setting is a deterministic post cadence, not a random chance.
 * This keeps a newly-enabled relationship predictable and makes reopening the
 * app unable to silently change whether a comment should happen.
 */
export function shouldGenerateRelationshipNetworkMomentComment(input: {
  existingMoments: readonly Moment[];
  targetCharacterId?: string;
  targetIdentityId?: string;
  sourceCharacterId: string;
  sourceRelationId: string;
  ownerIdentityId: string;
  frequency: RelationshipNetworkMomentCommentFrequency;
  action?: RelationshipNetworkInteractionAction;
  sourceDisplayName?: string;
}): boolean {
  const targetMoments = input.existingMoments
    .filter((moment) =>
      (input.targetCharacterId
        ? moment.characterId === input.targetCharacterId
        : !moment.characterId && (moment.ownerIdentityId || DEFAULT_IDENTITY_ID) === input.targetIdentityId)
      && (moment.ownerIdentityId || DEFAULT_IDENTITY_ID) === input.ownerIdentityId,
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  const lastInteractionAt = input.action === "like"
    ? targetMoments.reduce((latest, moment) =>
      input.sourceDisplayName && hasSourceLiked(moment, input.sourceDisplayName) ? Math.max(latest, moment.timestamp) : latest, 0)
    : input.action === "reply"
      ? targetMoments
        .flatMap((moment) => getMomentComments(moment).map((comment) => ({ comment, moment })))
        .filter(({ comment }) =>
          Boolean(comment.replyToCommentId)
          && (comment.relationId === input.sourceRelationId || comment.characterId === input.sourceCharacterId),
        )
        .reduce((latest, { comment }) => Math.max(latest, comment.timestamp), 0)
      : targetMoments
      .flatMap((moment) => getMomentComments(moment).map((comment) => ({ comment, moment })))
      .filter(({ comment }) =>
        comment.relationId === input.sourceRelationId || comment.characterId === input.sourceCharacterId,
      )
      .reduce((latest, { comment }) => Math.max(latest, comment.timestamp), 0);

  // A relationship's first eligible post is always a chance to establish the
  // NPC's presence. Afterwards, low/normal/high mean every 3/2/1 target posts.
  if (!lastInteractionAt) return true;
  const postsSinceLastInteraction = targetMoments.filter((moment) => moment.timestamp > lastInteractionAt).length + 1;
  return postsSinceLastInteraction >= MOMENT_CADENCE_BY_FREQUENCY[input.frequency];
}

export function listRelationshipNetworkMomentCommentCandidates(input: {
  ownerIdentityId: string;
  targetCharacterId?: string;
  targetIdentityId?: string;
  targetIdentityName?: string;
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  existingMoments: readonly Moment[];
  currentMoment?: Moment;
  force?: boolean;
  action?: RelationshipNetworkInteractionAction;
}): RelationshipNetworkMomentCommentCandidate[] {
  const targetCharacter = input.targetCharacterId
    ? input.characters.find((character) =>
      character.id === input.targetCharacterId
      && belongsToIdentity(character, input.ownerIdentityId),
    )
    : undefined;
  const targetIdentityId = input.targetIdentityId === input.ownerIdentityId ? input.targetIdentityId : undefined;
  if (!targetCharacter && !targetIdentityId) return [];

  const action = input.action || "comment";
  const replyingTo = action === "reply"
    ? getMomentComments(input.currentMoment || { id: "", authorName: "", authorAvatar: "", content: "", timestamp: 0, likes: [], comments: [] })
      .filter((comment) => !comment.characterId && !comment.relationId)
      .sort((left, right) => left.timestamp - right.timestamp)
      .at(-1)
    : undefined;
  if (action === "reply" && !replyingTo) return [];
  const targetCanonicalId = targetCharacter ? resolveCanonicalCharacterId(targetCharacter.id, input.characters) : undefined;
  const npcs = new Map(listRelationshipNetworkNpcsForIdentity(input.ownerIdentityId).map((npc) => [npc.id, npc]));
  const chatLinks = new Map(listRelationshipNetworkChatLinksForIdentity(input.ownerIdentityId).map((link) => [link.npcId, link]));
  const seenSourceCharacterIds = new Set<string>();

  return listRelationshipNetworkSocialLinksForIdentity(input.ownerIdentityId)
    .filter((socialLink) =>
      socialLink.enabled
      && socialLink.canViewMoments
      && (action === "comment"
        ? socialLink.canCommentMoments
        : action === "like"
          ? socialLink.canLikeMoments === true
          : socialLink.canReplyMoments === true)
      && socialLink.sourceEntityType === "npc"
      && ((targetCharacter
        && socialLink.targetEntityType === "character"
        && resolveCanonicalCharacterId(socialLink.targetEntityId, input.characters) === targetCanonicalId)
        || (!targetCharacter
          && socialLink.targetEntityType === "identity"
          && socialLink.targetEntityId === targetIdentityId)),
    )
    .map((socialLink): RelationshipNetworkMomentCommentCandidate | null => {
      const npc = npcs.get(socialLink.sourceEntityId);
      if (!npc) return null;
      const chatLink = chatLinks.get(npc.id);
      const sourceCharacter = findSourceCharacter(npc, chatLink?.characterId || npc.linkedCharacterId, input.characters, input.ownerIdentityId);
      if (!sourceCharacter || (targetCharacter && sourceCharacter.id === targetCharacter.id)) return null;
      const sourceRelationship = chatLink
        ? input.relationships.find((relationship) =>
          relationship.id === chatLink.relationId
          && relationship.userIdentityId === input.ownerIdentityId
          && resolveCanonicalCharacterId(relationship.characterId, input.characters) === resolveCanonicalCharacterId(sourceCharacter.id, input.characters),
        )
        : findRelationshipForCanonicalCharacter(input.relationships, input.ownerIdentityId, sourceCharacter.id, input.characters);
      if (!sourceRelationship || seenSourceCharacterIds.has(sourceCharacter.id)) return null;
      if (input.currentMoment && (action === "comment"
        ? hasSourceCommented(input.currentMoment, sourceCharacter.id, sourceRelationship.id)
        : action === "like"
          ? hasSourceLiked(input.currentMoment, npc.name)
          : hasSourceRepliedToComment(input.currentMoment, sourceCharacter.id, sourceRelationship.id, replyingTo!.id))) return null;
      if (!input.force && !shouldGenerateRelationshipNetworkMomentComment({
        existingMoments: input.existingMoments,
        ...(targetCharacter ? { targetCharacterId: targetCharacter.id } : { targetIdentityId }),
        sourceCharacterId: sourceCharacter.id,
        sourceRelationId: sourceRelationship.id,
        ownerIdentityId: input.ownerIdentityId,
        frequency: socialLink.commentFrequency,
        action,
        sourceDisplayName: npc.name,
      })) return null;
      seenSourceCharacterIds.add(sourceCharacter.id);
      return {
        socialLink,
        npc,
        sourceCharacter,
        sourceRelationship,
        targetEntityType: targetCharacter ? "character" : "identity",
        targetEntityId: targetCharacter?.id || targetIdentityId || input.ownerIdentityId,
        ...(targetCharacter ? { targetCharacter } : {}),
        ...(replyingTo ? { replyingTo } : {}),
        ...(!targetCharacter ? {
          targetIdentityId,
          targetIdentityName: input.targetIdentityName || "我的身份",
        } : {}),
      };
    })
    .filter((candidate): candidate is RelationshipNetworkMomentCommentCandidate => Boolean(candidate));
}

export async function generateRelationshipNetworkNpcMomentComment(input: {
  candidate: RelationshipNetworkMomentCommentCandidate;
  moment: Moment;
  targetDescription: string;
  worldBookEntries: readonly WorldBookEntry[];
  topicHistory: Parameters<typeof generateAutomaticMomentComment>[0]["topicHistory"];
  knowledgeClaims: readonly KnowledgeClaim[];
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  settings: UserSettings;
  requestAi: typeof apiChat;
  cleanText: (text: string) => string;
  characterExpressionPrompt: string;
}): Promise<Awaited<ReturnType<typeof generateAutomaticMomentComment>>> {
  const { candidate } = input;
  const targetName = candidate.targetCharacter?.remark
    || candidate.targetCharacter?.name
    || candidate.targetIdentityName
    || "我的身份";
  const networkTargetDescription = [
    input.targetDescription,
    `发帖人：${targetName}`,
    `关系网中，${candidate.npc.name} 与发帖人的关系是「${candidate.socialLink.relationshipLabel || "好友"}」。`,
    "这是公开朋友圈互动，不是私聊；只能回应这条新动态里明确出现的内容。",
  ].join("\n");
  return generateAutomaticMomentComment({
    moment: input.moment,
    targetDescription: networkTargetDescription,
    character: candidate.sourceCharacter,
    relationship: candidate.sourceRelationship,
    worldBookEntries: input.worldBookEntries,
    topicHistory: input.topicHistory,
    knowledgeClaims: input.knowledgeClaims,
    memories: input.memories,
    events: input.events,
    settings: input.settings,
    requestAi: input.requestAi,
    cleanText: input.cleanText,
    characterExpressionPrompt: input.characterExpressionPrompt,
  });
}

export async function generateRelationshipNetworkNpcMomentReply(input: {
  candidate: RelationshipNetworkMomentCommentCandidate;
  moment: Moment;
  targetDescription: string;
  worldBookEntries: readonly WorldBookEntry[];
  topicHistory: Parameters<typeof generateAutomaticMomentComment>[0]["topicHistory"];
  knowledgeClaims: readonly KnowledgeClaim[];
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  settings: UserSettings;
  requestAi: typeof apiChat;
  cleanText: (text: string) => string;
  characterExpressionPrompt: string;
}): Promise<Awaited<ReturnType<typeof generateAutomaticMomentReply>>> {
  const { candidate } = input;
  const replyingTo = candidate.replyingTo;
  if (!replyingTo) return undefined;
  return generateAutomaticMomentReply({
    targetMoment: input.moment,
    targetDescription: [
      input.targetDescription,
      `评论作者：${replyingTo.authorName}`,
      `评论内容：${replyingTo.content}`,
      `关系网中，${candidate.npc.name} 与发帖人的关系是「${candidate.socialLink.relationshipLabel || "好友"}」。`,
    ].join("\n"),
    userCommentText: replyingTo.content,
    replyingToContent: replyingTo.content,
    replyTargetName: replyingTo.authorName,
    character: candidate.sourceCharacter,
    relationship: candidate.sourceRelationship,
    worldBookEntries: input.worldBookEntries,
    topicHistory: input.topicHistory,
    knowledgeClaims: input.knowledgeClaims,
    memories: input.memories,
    events: input.events,
    settings: input.settings,
    requestAi: input.requestAi,
    cleanText: input.cleanText,
    characterExpressionPrompt: input.characterExpressionPrompt,
  });
}
