import type { Moment } from "../../types";

export interface KnownMomentsContextInput {
  moments: Moment[];
  activeCharacterId: string;
  activeIdentityId: string;
  userName: string;
  getPublicBody: (moment: Moment) => string;
}

/** Builds only Moment facts the current chat character can safely know. */
export function buildKnownMomentsContext({
  moments,
  activeCharacterId,
  activeIdentityId,
  userName,
  getPublicBody,
}: KnownMomentsContextInput): string {
  const knownMoments = moments
    .filter((moment) => (moment.ownerIdentityId || "identity-1") === activeIdentityId)
    .filter((moment) => !moment.characterId || moment.characterId === activeCharacterId)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 8);

  if (knownMoments.length === 0) return "";

  const lines = knownMoments.map((moment) => {
    const author = moment.characterId === activeCharacterId ? "你(发布人)" : `${userName}(机主)`;
    const date = new Date(moment.timestamp).toLocaleDateString("zh-CN");
    return `- ${date} | ${author} 发表朋友圈正文: "${getPublicBody(moment)}"`;
  });

  return `[🚨 微信朋友圈真实上下文]
以下仅包含真实存在、属于当前用户身份，且你能够知道的朋友圈正文。不要虚构机主发布过上下文中不存在的朋友圈；不要把其他发布者的动态归为机主；不确定时避免断言。
${lines.join("\n")}`;
}
