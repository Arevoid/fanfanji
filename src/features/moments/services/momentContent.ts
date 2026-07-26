import type { Moment } from "../../../types";

/**
 * Moments are text-only. Normalize both legacy and newly generated chat voice
 * markup at the feature boundary without mutating persisted records.
 */
export const stripMomentVoiceMarkup = (content: string) => content
  .replace(/\[(?:语音|voice)\]\s*\|\s*\d+(?:\s*(?:秒|s))?\s*\|\s*/gi, "")
  .replace(/\[(?:语音|voice)\s*\|\s*\d+(?:\s*(?:秒|s))?\]\s*/gi, "")
  .replace(/\[(?:语音|voice)\s*:\s*"([^"]+)"\s*\(\s*\d+(?:秒|s)\s*\)\]/gi, "$1")
  .replace(/\[(?:语音|voice)\s*:\s*([^\]\n]+?)\s*\(\s*\d+(?:秒|s)\s*\)\]/gi, "$1")
  .replace(/\[(?:语音|voice)\s*:\s*"([^"]+)"\]/gi, "$1");

/** Removes chat-only sticker markup while preserving ordinary Unicode emoji. */
export const stripMomentStickerMarkup = (content: string) => content
  .replace(/\[(?:表情包|表情|贴纸|sticker|emoji[-\s]?sticker)(?:\s*[|:：][^\]\n]*)?\]\s*/gi, "");

/** Normalizes user publishing input at the Moments feature boundary. */
export const sanitizeMomentPublishText = (content: string) =>
  stripMomentStickerMarkup(stripMomentVoiceMarkup(content)).trim();

/** Normalizes legacy generated Moment text without changing persisted data. */
export const cleanAndExtractMoment = (content: string) => {
  let cleanContent = sanitizeMomentPublishText(content);
  const selfComments: string[] = [];
  let imageDescription: string | undefined;

  cleanContent = cleanContent.replace(/(?:^|\n)\s*[（(]\s*配图\s*[：:]\s*([^）)\n]+)\s*[）)]\s*/g, (_match, text) => {
    if (!imageDescription && text.trim()) imageDescription = text.trim();
    return "\n";
  });
  cleanContent = cleanContent.replace(/^\s*(?:朋友圈[动态]?\s*[：:]\s*)/i, "");
  cleanContent = cleanContent.replace(/(?:^|\n)\s*[（(]\s*评论\s*[：:]\s*([^）)]+)[）)]\s*/g, (_match, text) => {
    if (text.trim()) selfComments.push(text.trim());
    return "\n";
  });
  cleanContent = cleanContent.replace(/(?:^|\n)\s*评论\s*[：:]\s*([^\n]+)/g, (_match, text) => {
    if (text.trim()) selfComments.push(text.trim());
    return "\n";
  });
  const startPostRegex = /^[（(]\s*[^）)]*?发了[^）)]*?朋友圈\s*[）)]\s*\n*/i;
  cleanContent = cleanContent.replace(startPostRegex, "");
  const selfCommentRegex = /\(\s*评论\s*[:：]\s*(.*?)\)/g;
  cleanContent = cleanContent.replace(selfCommentRegex, (_fullMatch, commentText) => {
    if (commentText && commentText.trim()) selfComments.push(commentText.trim());
    return "";
  });
  const lineCommentRegex = /(?:^|\n)\s*(?:评论|评论区补|自评|评论区自己补了一?条?|自己补了一?条?)\s*[：:]\s*(.*?)(?=\n|$)/g;
  cleanContent = cleanContent.replace(lineCommentRegex, (_fullMatch, commentText) => {
    if (commentText && commentText.trim()) selfComments.push(commentText.trim());
    return "";
  });
  cleanContent = cleanContent.trim().replace(/^\n+|\n+$/g, "").trim();
  return { content: cleanContent, selfComments, imageDescription };
};

export const renderMomentContent = (content: string) => cleanAndExtractMoment(content).content;

export const getMomentComments = (moment: Moment) => {
  const parsed = cleanAndExtractMoment(moment.content);
  const dynamicComments: typeof moment.comments = [];
  parsed.selfComments.forEach((text, index) => {
    const exists = moment.comments.some((comment) => comment.content === text && comment.authorName === moment.authorName);
    if (!exists) {
      dynamicComments.push({
        id: `${moment.id}-dynamic-self-${index}`,
        authorName: moment.authorName,
        authorAvatar: moment.authorAvatar,
        content: text,
        timestamp: moment.timestamp + (index + 1) * 1000,
      });
    }
  });
  const deletedCommentIds = new Set(moment.deletedCommentIds || []);
  return [...moment.comments, ...dynamicComments]
    .filter((comment) => !deletedCommentIds.has(comment.id))
    .map((comment) => ({ ...comment, content: stripMomentVoiceMarkup(comment.content).trim() }));
};
