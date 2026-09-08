import type { Moment } from "../../types";

export interface KnownMomentsContextInput {
  moments: Moment[];
  activeCharacterId: string;
  activeIdentityId: string;
  userName: string;
  getPublicBody: (moment: Moment) => string;
  getPublicComments: (moment: Moment) => Readonly<Moment["comments"]>;
}

/** Builds only Moment facts the current chat character can safely know. */
export function buildKnownMomentsContext({
  moments,
  activeCharacterId,
  activeIdentityId,
  userName,
  getPublicBody,
  getPublicComments,
}: KnownMomentsContextInput): string {
  const knownMoments = moments
    .filter((moment) => (moment.ownerIdentityId || "identity-1") === activeIdentityId)
    .filter((moment) => !moment.characterId || moment.characterId === activeCharacterId)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 8);

  if (knownMoments.length === 0) return "";

  const lines = knownMoments.map((moment) => {
    const isCharacterMoment = moment.characterId === activeCharacterId;
    const author = isCharacterMoment ? "角色本人（你，发布人）" : `${userName}（机主，发布人）`;
    const date = new Date(moment.timestamp).toLocaleDateString("zh-CN");
    const comments = getPublicComments(moment).slice(-6).map((comment) => {
      const commentAuthor = isCharacterMoment && comment.authorName === moment.authorName
        ? "角色本人（你）"
        : comment.authorName === userName
          ? `${userName}（机主）`
          : comment.authorName;
      return `  - 评论作者 ${commentAuthor}: "${comment.content}"`;
    });
    return [
      `- ${date} | ${author} | 正文: "${getPublicBody(moment)}"`,
      ...comments,
    ].join("\n");
  });

  return `[🚨 微信朋友圈真实上下文]
以下仅包含真实存在、属于当前用户身份，且你能够知道的朋友圈正文与公开评论。发布人和每条评论的作者标签是不可交换的事实。
角色本人发布或由角色本人评论确认的“我”，指角色本人，不是机主；机主发布或由机主评论确认的“我”，才指机主。禁止把角色要做的事说成机主要做，也禁止反向调换。正文有歧义时，必须结合评论中的明确确认；仍不确定就不要断言。
${lines.join("\n")}`;
}
