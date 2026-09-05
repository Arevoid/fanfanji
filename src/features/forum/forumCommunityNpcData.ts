import type { ForumCommunityNpc, ForumPublicAuthor, ForumVirtualProfile } from "../../types";

export const toForumCommunityNpcProfile = (npc: ForumCommunityNpc): ForumVirtualProfile => ({
  id: `community:${npc.id}`,
  displayName: npc.displayName,
  avatarSeed: npc.id,
  publicStyle: [npc.personaSummary, npc.publicStyle].filter(Boolean).join("；"),
});

export const toForumCommunityNpcAuthor = (npc: ForumCommunityNpc): ForumPublicAuthor => ({
  displayName: npc.displayName,
  ...(npc.avatar ? { avatar: npc.avatar } : {}),
  kind: "virtual",
  isAnonymous: false,
});

export const createForumCommunityNpc = (input: {
  id: string;
  ownerIdentityId: string;
  displayName: string;
  avatar?: string;
  personaSummary: string;
  publicStyle?: string;
  now: number;
}): ForumCommunityNpc => ({
  id: input.id,
  ownerIdentityId: input.ownerIdentityId,
  displayName: input.displayName.trim(),
  ...(input.avatar?.trim() ? { avatar: input.avatar.trim() } : {}),
  personaSummary: input.personaSummary.trim(),
  publicStyle: (input.publicStyle || input.personaSummary).trim(),
  enabled: true,
  createdAt: input.now,
  updatedAt: input.now,
});
