import type { ForumThread } from "../../types";

export interface ForumPostAuthorPolicy {
  npcWeight: number;
  relationshipWeight: number;
  anonymousRelationshipProbability: number;
  recentWindowSize: number;
  maxRelationshipPostsInWindow: number;
  maxNamedRelationshipPostsInWindow: number;
  relationshipPostCooldownMs: number;
}

export const DEFAULT_FORUM_POST_AUTHOR_POLICY: ForumPostAuthorPolicy = {
  npcWeight: 90,
  relationshipWeight: 10,
  anonymousRelationshipProbability: 0.6,
  recentWindowSize: 10,
  maxRelationshipPostsInWindow: 3,
  maxNamedRelationshipPostsInWindow: 2,
  relationshipPostCooldownMs: 36 * 60 * 60 * 1000,
};

export const automaticForumThreads = (threads: readonly ForumThread[]) => threads
  .filter((thread) => thread.source !== "user" && thread.source !== "user-anonymous")
  .sort((a, b) => b.occurredAt - a.occurredAt);

export const canUseRelationshipThreadAuthor = (input: {
  relationId: string;
  threads: readonly ForumThread[];
  now: number;
  policy?: ForumPostAuthorPolicy;
}): boolean => {
  const policy = input.policy || DEFAULT_FORUM_POST_AUTHOR_POLICY;
  const recent = automaticForumThreads(input.threads).slice(0, policy.recentWindowSize);
  const relationshipPosts = recent.filter((thread) => Boolean(thread.privateAuthorRelationId));
  const namedPosts = relationshipPosts.filter((thread) => !thread.publicAuthor.isAnonymous);
  if (relationshipPosts.length >= policy.maxRelationshipPostsInWindow) return false;
  if (namedPosts.length >= policy.maxNamedRelationshipPostsInWindow) return false;
  const latestOwn = automaticForumThreads(input.threads)
    .find((thread) => thread.privateAuthorRelationId === input.relationId);
  return !latestOwn || input.now - latestOwn.occurredAt >= policy.relationshipPostCooldownMs;
};

export const chooseForumThreadAuthorKind = (input: {
  relationAvailable: boolean;
  relationshipAllowed: boolean;
  random: () => number;
  policy?: ForumPostAuthorPolicy;
}): "virtual" | "relationship" => {
  const policy = input.policy || DEFAULT_FORUM_POST_AUTHOR_POLICY;
  if (!input.relationAvailable || !input.relationshipAllowed) return "virtual";
  return input.random() * (policy.npcWeight + policy.relationshipWeight) >= policy.npcWeight
    ? "relationship"
    : "virtual";
};
