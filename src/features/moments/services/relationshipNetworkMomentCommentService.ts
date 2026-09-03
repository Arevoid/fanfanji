import type { Character, MemoryItem, Moment, MomentComment, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { DEFAULT_IDENTITY_ID } from "../../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import { resolveRelationshipNetworkNpcActor } from "../../../domain/relationshipNetwork/relationshipNetworkNpcActor";
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
import { buildWorldBookSystemBlocks } from "../../../utils/worldBook";
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

/** A linked character who may optionally participate in an NPC's public Moment. */
export interface RelationshipNetworkCharacterMomentCommentCandidate {
  socialLink: RelationshipNetworkSocialLink;
  npc: RelationshipNetworkNpc;
  targetCharacter: Character;
  targetRelationship: CharacterRelationship;
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

function buildCharacterMomentCommentCandidate(input: {
  ownerIdentityId: string;
  npc: RelationshipNetworkNpc;
  socialLink: RelationshipNetworkSocialLink;
  targetCharacterId: string;
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
}): RelationshipNetworkCharacterMomentCommentCandidate | undefined {
  if (input.socialLink.ownerIdentityId !== input.ownerIdentityId
    || input.socialLink.sourceEntityType !== "npc"
    || input.socialLink.sourceEntityId !== input.npc.id
    || input.socialLink.targetEntityType !== "character"
    || !input.socialLink.enabled
    || !input.socialLink.canViewMoments) return undefined;
  const linkedTargetCanonicalId = resolveCanonicalCharacterId(input.socialLink.targetEntityId, input.characters);
  const requestedTargetCanonicalId = resolveCanonicalCharacterId(input.targetCharacterId, input.characters);
  const targetCharacter = input.characters.find((character) =>
    resolveCanonicalCharacterId(character.id, input.characters) === linkedTargetCanonicalId
    && resolveCanonicalCharacterId(character.id, input.characters) === requestedTargetCanonicalId
    && belongsToIdentity(character, input.ownerIdentityId)
    && !character.isGroupChat
    && character.relationshipNetworkNpcId !== input.npc.id,
  );
  if (!targetCharacter) return undefined;
  const targetCanonicalId = resolveCanonicalCharacterId(targetCharacter.id, input.characters);
  const targetRelationship = input.relationships.find((relationship) =>
    relationship.userIdentityId === input.ownerIdentityId
    && resolveCanonicalCharacterId(relationship.characterId, input.characters) === targetCanonicalId,
  );
  if (!targetRelationship) return undefined;
  return { socialLink: input.socialLink, npc: input.npc, targetCharacter, targetRelationship };
}

export function findRelationshipNetworkCharacterMomentCommentCandidate(input: {
  ownerIdentityId: string;
  npcId: string;
  targetCharacterId: string;
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
}): RelationshipNetworkCharacterMomentCommentCandidate | undefined {
  const npc = listRelationshipNetworkNpcsForIdentity(input.ownerIdentityId).find((candidate) => candidate.id === input.npcId);
  if (!npc) return undefined;
  const socialLink = listRelationshipNetworkSocialLinksForIdentity(input.ownerIdentityId).find((candidate) =>
    candidate.sourceEntityType === "npc"
    && candidate.sourceEntityId === input.npcId
    && candidate.targetEntityType === "character"
    && resolveCanonicalCharacterId(candidate.targetEntityId, input.characters)
      === resolveCanonicalCharacterId(input.targetCharacterId, input.characters),
  );
  return socialLink
    ? buildCharacterMomentCommentCandidate({ ...input, npc, socialLink })
    : undefined;
}

export function listRelationshipNetworkCharacterMomentCommentCandidates(input: {
  ownerIdentityId: string;
  moment: Moment;
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
}): RelationshipNetworkCharacterMomentCommentCandidate[] {
  const npcId = input.moment.relationshipNetworkNpcId;
  if (!npcId || (input.moment.ownerIdentityId || DEFAULT_IDENTITY_ID) !== input.ownerIdentityId) return [];
  const npc = listRelationshipNetworkNpcsForIdentity(input.ownerIdentityId).find((candidate) => candidate.id === npcId);
  if (!npc) return [];
  const seenTargetCharacterIds = new Set<string>();
  return listRelationshipNetworkSocialLinksForIdentity(input.ownerIdentityId)
    .filter((socialLink) => socialLink.sourceEntityType === "npc" && socialLink.sourceEntityId === npc.id)
    .map((socialLink) => buildCharacterMomentCommentCandidate({
      ownerIdentityId: input.ownerIdentityId,
      npc,
      socialLink,
      targetCharacterId: socialLink.targetEntityId,
      characters: input.characters,
      relationships: input.relationships,
    }))
    .filter((candidate): candidate is RelationshipNetworkCharacterMomentCommentCandidate => {
      if (!candidate || seenTargetCharacterIds.has(candidate.targetCharacter.id)) return false;
      seenTargetCharacterIds.add(candidate.targetCharacter.id);
      return true;
    });
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
      .filter((comment) => !comment.characterId && !comment.relationId
        || Boolean(targetCharacter && comment.characterId === targetCharacter.id))
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
      const actor = resolveRelationshipNetworkNpcActor({
        npc,
        ownerIdentityId: input.ownerIdentityId,
        characters: input.characters,
        relationships: input.relationships,
        preferredCharacterId: chatLink?.characterId || npc.linkedCharacterId,
        preferredRelationId: chatLink?.relationId,
      });
      const { character: sourceCharacter, relationship: sourceRelationship } = actor;
      // A promoted NPC and its lightweight NPC record still describe one
      // person. Do not let that person comment on their own post/profile.
      const isNpcOwnMoment = input.currentMoment?.relationshipNetworkNpcId === npc.id
        || targetCharacter?.relationshipNetworkNpcId === npc.id;
      const isReplyToLinkedCharacter = action === "reply"
        && Boolean(replyingTo?.characterId && targetCharacter
          && resolveCanonicalCharacterId(replyingTo.characterId, input.characters)
            === resolveCanonicalCharacterId(targetCharacter.id, input.characters));
      if (isNpcOwnMoment && !isReplyToLinkedCharacter) return null;
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
  const targetProfile = candidate.targetCharacter
    ? [
      `目标人物公开资料：${candidate.targetCharacter.name}`,
      candidate.targetCharacter.remark ? `身份/备注：${candidate.targetCharacter.remark}` : "",
      candidate.targetCharacter.personality ? `性格：${candidate.targetCharacter.personality}` : "",
      candidate.targetCharacter.backstory ? `背景：${candidate.targetCharacter.backstory}` : "",
    ].filter(Boolean).join("\n")
    : "";
  const networkTargetDescription = [
    input.targetDescription,
    `发帖人：${targetName}`,
    `关系网中，${candidate.npc.name} 与发帖人的关系是「${candidate.socialLink.relationshipLabel || "好友"}」。`,
    targetProfile,
    "这是公开朋友圈互动，不是私聊；只能回应这条新动态里明确出现的内容。",
  ].join("\n");
  const targetWorldKnowledge = candidate.targetCharacter
    ? buildWorldBookSystemBlocks(
      [...input.worldBookEntries],
      candidate.targetCharacter.id,
      networkTargetDescription,
      { scenario: "public", characterId: candidate.targetCharacter.id },
    ).allTriggered.map((entry) => ({ title: entry.title, content: entry.content }))
    : [];
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
    additionalWorldKnowledge: targetWorldKnowledge,
  });
}

export async function generateRelationshipNetworkCharacterMomentComment(input: {
  candidate: RelationshipNetworkCharacterMomentCommentCandidate;
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
  const networkTargetDescription = [
    input.targetDescription,
    `发帖人：${candidate.npc.name}`,
    `你是${candidate.targetCharacter.remark || candidate.targetCharacter.name}，正在浏览这条公开朋友圈。`,
    `你与${candidate.npc.name}的关系是「${candidate.socialLink.relationshipLabel || "好友"}」。`,
    "这是可选的公开互动；有自然想法才评论，如果话题已经结束或没有必要接话，请输出 [SKIP]。",
  ].join("\n");
  const targetWorldKnowledge = buildWorldBookSystemBlocks(
    [...input.worldBookEntries],
    candidate.targetCharacter.id,
    networkTargetDescription,
    { scenario: "public", characterId: candidate.targetCharacter.id },
  ).allTriggered.map((entry) => ({ title: entry.title, content: entry.content }));
  return generateAutomaticMomentComment({
    moment: input.moment,
    targetDescription: networkTargetDescription,
    character: candidate.targetCharacter,
    relationship: candidate.targetRelationship,
    worldBookEntries: input.worldBookEntries,
    topicHistory: input.topicHistory,
    knowledgeClaims: input.knowledgeClaims,
    memories: input.memories,
    events: input.events,
    settings: input.settings,
    requestAi: input.requestAi,
    cleanText: input.cleanText,
    characterExpressionPrompt: input.characterExpressionPrompt,
    additionalWorldKnowledge: targetWorldKnowledge,
    allowSkip: true,
  });
}

export async function generateRelationshipNetworkCharacterMomentReply(input: {
  candidate: RelationshipNetworkCharacterMomentCommentCandidate;
  moment: Moment;
  targetDescription: string;
  replyingTo: MomentComment;
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
  const networkTargetDescription = [
    input.targetDescription,
    `发帖人：${candidate.npc.name}`,
    `你是${candidate.targetCharacter.remark || candidate.targetCharacter.name}。`,
    `你正在回复${candidate.npc.name}在这条公开朋友圈下的评论。`,
    `评论内容：${input.replyingTo.content}`,
    "这是可选的公开互动；如果事情已经说完或继续回复会显得勉强，请输出 [SKIP]。",
  ].join("\n");
  const targetWorldKnowledge = buildWorldBookSystemBlocks(
    [...input.worldBookEntries],
    candidate.targetCharacter.id,
    networkTargetDescription,
    { scenario: "public", characterId: candidate.targetCharacter.id },
  ).allTriggered.map((entry) => ({ title: entry.title, content: entry.content }));
  return generateAutomaticMomentReply({
    targetMoment: input.moment,
    targetDescription: networkTargetDescription,
    userCommentText: input.replyingTo.content,
    replyingToContent: input.replyingTo.content,
    replyTargetName: input.replyingTo.authorName,
    character: candidate.targetCharacter,
    relationship: candidate.targetRelationship,
    worldBookEntries: input.worldBookEntries,
    topicHistory: input.topicHistory,
    knowledgeClaims: input.knowledgeClaims,
    memories: input.memories,
    events: input.events,
    settings: input.settings,
    requestAi: input.requestAi,
    cleanText: input.cleanText,
    characterExpressionPrompt: input.characterExpressionPrompt,
    additionalWorldKnowledge: targetWorldKnowledge,
    allowSkip: true,
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
  const targetName = candidate.targetCharacter?.remark
    || candidate.targetCharacter?.name
    || candidate.targetIdentityName
    || "我的身份";
  const targetProfile = candidate.targetCharacter
    ? [
      `目标人物公开资料：${candidate.targetCharacter.name}`,
      candidate.targetCharacter.remark ? `身份/备注：${candidate.targetCharacter.remark}` : "",
      candidate.targetCharacter.personality ? `性格：${candidate.targetCharacter.personality}` : "",
      candidate.targetCharacter.backstory ? `背景：${candidate.targetCharacter.backstory}` : "",
    ].filter(Boolean).join("\n")
    : "";
  const networkTargetDescription = [
    input.targetDescription,
    `发帖人：${targetName}`,
    `关系网中，${candidate.npc.name} 与发帖人的关系是「${candidate.socialLink.relationshipLabel || "好友"}」。`,
    targetProfile,
  ].join("\n");
  const targetWorldKnowledge = candidate.targetCharacter
    ? buildWorldBookSystemBlocks(
      [...input.worldBookEntries],
      candidate.targetCharacter.id,
      networkTargetDescription,
      { scenario: "public", characterId: candidate.targetCharacter.id },
    ).allTriggered.map((entry) => ({ title: entry.title, content: entry.content }))
    : [];
  return generateAutomaticMomentReply({
    targetMoment: input.moment,
    targetDescription: [
      networkTargetDescription,
      `评论作者：${replyingTo.authorName}`,
      `评论内容：${replyingTo.content}`,
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
    additionalWorldKnowledge: targetWorldKnowledge,
    allowSkip: true,
  });
}
