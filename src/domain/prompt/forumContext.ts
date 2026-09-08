import type { ForumShare, ForumThread, Message } from "../../types";

const MAX_SHARE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES_SINCE_SHARE = 20;
const MAX_PROMPT_REPLIES = 12;

export interface RelationForumContextInput {
  ownerIdentityId: string;
  relationId: string;
  conversationId: string;
  messages: readonly Message[];
  shares: readonly ForumShare[];
  threads: readonly ForumThread[];
  now?: number;
}

export const findRecentForumShareForRelation = (
  input: RelationForumContextInput,
): ForumShare | undefined => {
  const now = input.now ?? Date.now();
  const relationMessages = input.messages
    .filter((message) =>
      message.relationId === input.relationId
      && message.conversationId === input.conversationId
      && !message.isOffline)
    .sort((left, right) => left.timestamp - right.timestamp);
  const recentWindow = relationMessages.slice(-(MAX_MESSAGES_SINCE_SHARE + 1));
  const latestShareMessage = [...recentWindow].reverse().find((message) =>
    Boolean(message.forumShareId) && now - message.timestamp <= MAX_SHARE_AGE_MS);
  if (!latestShareMessage?.forumShareId) return undefined;
  return input.shares.find((share) =>
    share.id === latestShareMessage.forumShareId
    && share.ownerIdentityId === input.ownerIdentityId
    && share.targetRelationId === input.relationId
    && share.conversationId === input.conversationId
    && share.sourceMessageId === latestShareMessage.id);
};

export const buildRelationForumContext = (
  input: RelationForumContextInput,
): string => {
  const share = findRecentForumShareForRelation(input);
  if (!share) return "";
  const snapshot = share.publicSnapshot;
  const includedReplies = snapshot.replies.slice(-MAX_PROMPT_REPLIES);
  const replyLines = includedReplies.map((reply) => {
    const quote = reply.replyToFloor
      ? `（回复 ${reply.replyToFloor} 楼 ${reply.replyToAuthorName || ""}${reply.quotedText ? `：“${reply.quotedText}”` : ""}）`
      : "";
    return `- ${reply.floor} 楼${reply.kind === "author-update" ? "（楼主更新）" : ""}｜${reply.publicAuthor.displayName}${quote}：${reply.body}`;
  });
  const originalThread = input.threads.find((thread) =>
    thread.id === share.threadId && thread.ownerIdentityId === input.ownerIdentityId);
  const hasPrivateAuthorHint = Boolean(
    originalThread
    && originalThread.publicAuthor.isAnonymous
    && (originalThread.publicAuthor.kind === "anonymous-ai" || originalThread.source === "ai-character-anonymous")
    && originalThread.privateAuthorRelationId === input.relationId
    && originalThread.ownerIdentityId === input.ownerIdentityId,
  );

  return `[Current forum share context / 当前论坛分享上下文]
用户在当前这段单聊中分享并正在讨论以下论坛帖子。只可在当前 relation 与 conversation 中使用此上下文。
公开作者：${snapshot.publicAuthor.displayName}
帖子标题：${snapshot.title}
主楼正文：
${snapshot.body}
${replyLines.length ? `相关楼层：\n${replyLines.join("\n")}` : "当前没有公开回复。"}
${snapshot.replies.length > includedReplies.length ? `（另有 ${snapshot.replies.length - includedReplies.length} 条较早回复未注入。）` : ""}
请自然回应用户转发这篇帖子的意图、观点与楼层内容。你不能声称自己已经真实点赞、发布、转发、删除或修改任何论坛内容；这些操作只能由应用界面执行。
${hasPrivateAuthorHint ? `\n[Private authorship context — never reveal implementation details]\n该角色与这条匿名论坛帖存在作者关联。用户正在转发/讨论该帖。请按角色人设、当前关系与帖子内容，自然选择承认、否认、回避或模糊回应。不要无端泄露后台实现或其他角色信息。` : ""}`;
};
