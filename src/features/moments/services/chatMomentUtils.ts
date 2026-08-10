import type { Character, Moment, MomentComment, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { MomentTopicRecord } from "../../../domain/moments/momentGeneration/momentTopicTypes";
import { buildMomentPublicCognitiveContext } from "../../../domain/momentCognitive/momentPublicContextBuilder";
import { buildKnownMomentsContext } from "../../../domain/prompt/momentContext";
import { buildWorldBookSystemBlocks } from "../../../utils/worldBook";
import { stripMomentVoiceMarkup } from "./momentContent";

export const buildPublicMomentContext = (input: {
  character: Character;
  moments: readonly Moment[];
  comments?: readonly MomentComment[];
  topicHistory?: readonly MomentTopicRecord[];
  routine?: Character["routine"];
  now: number;
}) => buildMomentPublicCognitiveContext({
  character: input.character,
  publicMomentHistory: input.moments.map((moment) => ({
    characterId: input.character.id,
    visibility: "public" as const,
    authorName: moment.authorName,
    content: moment.content,
    timestamp: moment.timestamp,
    ...(moment.imageDescription ? { imageDescription: moment.imageDescription } : {}),
  })),
  publicCommentHistory: [...input.moments.flatMap((moment) => moment.comments), ...(input.comments || [])].map((comment) => ({
    characterId: input.character.id,
    visibility: "public" as const,
    authorName: comment.authorName,
    content: comment.content,
    timestamp: comment.timestamp,
  })),
  ...(input.topicHistory ? { topicHistory: input.topicHistory } : {}),
  ...(input.routine ? { routine: input.routine } : {}),
  currentTime: { now: input.now },
});

export const buildMomentWorldKnowledge = (entries: WorldBookEntry[], character: Character, relationship: CharacterRelationship, scanText: string) =>
  buildWorldBookSystemBlocks(entries, character.id, scanText, { scenario: "public", characterId: relationship.characterId })
    .allTriggered.map((entry) => ({ title: entry.title, content: entry.content }));

export const compactTopicHint = (values: readonly string[]): string => values
  .map((value) => value.replace(/\[[^\]]+\](?:\|[^\s]*)?/g, "").replace(/\s+/g, " ").trim())
  .filter(Boolean)
  .join(" ")
  .slice(0, 180);

export const cleanAndExtractMoment = (content: string) => {
  let cleanContent = stripMomentVoiceMarkup(content).trim();
  const selfComments: string[] = [];
  let imageDescription: string | undefined;
  cleanContent = cleanContent.replace(/(?:^|\n)\s*[（(]\s*配图\s*[：:]\s*([^）)\n]+)\s*[）)]\s*/g, (_match, text) => {
    if (!imageDescription && text.trim()) imageDescription = text.trim();
    return "\n";
  });
  cleanContent = cleanContent.replace(/^\s*(?:朋友圈|动态)\s*[：:]\s*/i, "");
  cleanContent = cleanContent.replace(/(?:^|\n)\s*[（(]\s*评论\s*[：:]\s*([^）)]+)[）)]\s*/g, (_match, text) => {
    if (text.trim()) selfComments.push(text.trim());
    return "\n";
  });
  cleanContent = cleanContent.replace(/(?:^|\n)\s*评论\s*[：:]\s*([^\n]+)/g, (_match, text) => {
    if (text.trim()) selfComments.push(text.trim());
    return "\n";
  });
  cleanContent = cleanContent.replace(/^[（\(]\s*[^）\)]*?发了[^）\)]*?朋友圈\s*[）\)]\s*\n*/i, "");
  cleanContent = cleanContent.replace(/[（\(](?:评论区(?:自己)?补了一?条|评论区(?:自己)?补了一?句|评论区自己补了|自己(?:在评论区)?补了一?条|自己(?:在评论区)?补了一?句|自评)\s*[：:]\s*(.*?)[）\)]/g, (_fullMatch, commentText) => {
    if (commentText?.trim()) selfComments.push(commentText.trim());
    return "";
  });
  cleanContent = cleanContent.replace(/(?:^|\n)\s*(?:评论|评论区补|自评|评论区自己补了一?条|自己补了一?条)\s*[：:]\s*(.*?)(?=\n|$)/g, (_fullMatch, commentText) => {
    if (commentText?.trim()) selfComments.push(commentText.trim());
    return "";
  });
  return { content: cleanContent.trim().replace(/^\n+|\n+$/g, "").trim(), selfComments, imageDescription };
};

export const renderMomentContent = (content: string) => cleanAndExtractMoment(content).content;

export const getMomentComments = (moment: Moment) => {
  const parsed = cleanAndExtractMoment(moment.content);
  const dynamicComments: typeof moment.comments = [];
  parsed.selfComments.forEach((text, index) => {
    if (!moment.comments.some((comment) => comment.content === text && comment.authorName === moment.authorName)) {
      dynamicComments.push({ id: `${moment.id}-dynamic-self-${index}`, authorName: moment.authorName, authorAvatar: moment.authorAvatar, content: text, timestamp: moment.timestamp + (index + 1) * 1000 });
    }
  });
  const deletedCommentIds = new Set(moment.deletedCommentIds || []);
  return [...moment.comments, ...dynamicComments]
    .filter((comment) => !deletedCommentIds.has(comment.id))
    .map((comment) => ({ ...comment, content: stripMomentVoiceMarkup(comment.content).trim() }));
};

export const getKnownMomentsContextString = (moments: Moment[], activeCharacter: Character, activeIdentityId: string, ownerName: string) => buildKnownMomentsContext({
  moments,
  activeCharacterId: activeCharacter.id,
  activeIdentityId,
  userName: ownerName,
  getPublicBody: (moment) => renderMomentContent(moment.content),
  getPublicComments: (moment) => getMomentComments(moment),
});

export const getPostIntervalMs = (character: Character) => {
  const profile = `${character.personality || ""} ${character.backstory || ""}`.toLowerCase();
  return (24 + Math.random() * (/(热爱分享|喜欢分享|热爱生活|发朋友圈|爱分享|活跃|话唠|分享欲)/i.test(profile) ? 24 : 96)) * 60 * 60 * 1000;
};

export const getRelationshipLastMomentTimestamp = (moments: Moment[], relationship: CharacterRelationship, characterId: string) => {
  const scoped = moments.filter((moment) => moment.relationId === relationship.id || (!moment.relationId && moment.characterId === characterId && (moment.ownerIdentityId || "identity-1") === relationship.userIdentityId));
  return scoped.length ? Math.max(...scoped.map((moment) => moment.timestamp)) : 0;
};
