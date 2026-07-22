import type { Moment } from "../../../types";

/** Normalizes legacy generated Moment text without changing persisted data. */
export const cleanAndExtractMoment = (content: string) => {
  let cleanContent = content.trim();
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
  return [...moment.comments, ...dynamicComments].filter((comment) => !deletedCommentIds.has(comment.id));
};
