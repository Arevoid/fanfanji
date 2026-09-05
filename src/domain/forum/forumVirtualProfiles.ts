import type { ForumPublicAuthor, ForumVirtualProfile } from "../../types";

export const FORUM_VIRTUAL_PROFILES: readonly ForumVirtualProfile[] = [
  { id: "forum-npc-01", displayName: "北窗听雨", avatarSeed: "cedar", publicStyle: "简短直接，偶尔补充亲身经验" },
  { id: "forum-npc-02", displayName: "半杯温水", avatarSeed: "clay", publicStyle: "语气温和，关注实际可行性" },
  { id: "forum-npc-03", displayName: "星期八散步", avatarSeed: "moss", publicStyle: "轻松吐槽，但不偏离主题" },
  { id: "forum-npc-04", displayName: "纸箱观察员", avatarSeed: "amber", publicStyle: "喜欢追问细节，回复通常很短" },
  { id: "forum-npc-05", displayName: "旧巷路灯", avatarSeed: "slate", publicStyle: "理性克制，给出清楚判断" },
  { id: "forum-npc-06", displayName: "海盐苏打", avatarSeed: "aqua", publicStyle: "随和自然，偶尔开一个小玩笑" },
  { id: "forum-npc-07", displayName: "夜班盆栽", avatarSeed: "fern", publicStyle: "偏经验型，重视安全和成本" },
  { id: "forum-npc-08", displayName: "慢速加载中", avatarSeed: "violet", publicStyle: "带一点自嘲，表达简洁" },
  { id: "forum-npc-09", displayName: "橘子汽水盖", avatarSeed: "orange", publicStyle: "活泼但不过度热情" },
  { id: "forum-npc-10", displayName: "楼下有只猫", avatarSeed: "rose", publicStyle: "善于补充生活细节和替代方案" },
  { id: "forum-npc-11", displayName: "无糖拿铁", avatarSeed: "coffee", publicStyle: "先给结论，再解释一两句" },
  { id: "forum-npc-12", displayName: "把灯关小点", avatarSeed: "navy", publicStyle: "安静客观，不使用客服式总结" },
  { id: "forum-npc-13", displayName: "雨停再出门", avatarSeed: "cloud", publicStyle: "谨慎务实，会指出不确定处" },
  { id: "forum-npc-14", displayName: "折角的书页", avatarSeed: "paper", publicStyle: "偏阅读和观察型，措辞自然" },
  { id: "forum-npc-15", displayName: "三分钟热度", avatarSeed: "coral", publicStyle: "直率、有一点吐槽感" },
  { id: "forum-npc-16", displayName: "风从阳台来", avatarSeed: "sky", publicStyle: "温和简短，愿意分享普通经验" },
] as const;

const hashText = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getForumVirtualProfile = (
  seed: string | number,
  offset = 0,
): ForumVirtualProfile => {
  const numericSeed = typeof seed === "number" ? seed : hashText(seed);
  return FORUM_VIRTUAL_PROFILES[
    Math.abs(numericSeed + offset) % FORUM_VIRTUAL_PROFILES.length
  ];
};

export const createForumVirtualAuthor = (
  profile: ForumVirtualProfile,
): ForumPublicAuthor => ({
  displayName: profile.displayName,
  kind: "virtual",
  isAnonymous: false,
});
