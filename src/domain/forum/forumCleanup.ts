import type { ForumGenerationTask, ForumReply, ForumShare, ForumThread } from "../../types";

export const clearAllForumDataByIdentity = (input: {
  threads: readonly ForumThread[];
  replies: readonly ForumReply[];
  shares: readonly ForumShare[];
  tasks: readonly ForumGenerationTask[];
  ownerIdentityId: string;
}): {
  threads: ForumThread[];
  replies: ForumReply[];
  shares: ForumShare[];
  tasks: ForumGenerationTask[];
} => ({
  threads: input.threads.filter((thread) => thread.ownerIdentityId !== input.ownerIdentityId),
  replies: input.replies.filter((reply) => reply.ownerIdentityId !== input.ownerIdentityId),
  shares: input.shares.filter((share) => share.ownerIdentityId !== input.ownerIdentityId),
  tasks: input.tasks.filter((task) => task.ownerIdentityId !== input.ownerIdentityId),
});
