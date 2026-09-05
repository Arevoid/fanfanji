import type { MomentComment } from "../../../types";

/** Maximum comments/replies one stable actor may leave under one Moment. */
export const MAX_MOMENT_COMMENTS_PER_ACTOR = 8;

export type MomentCommentActor = Pick<MomentComment, "characterId" | "relationId" | "sourceNpcId" | "authorName">;

const STABLE_ACTOR_FIELDS = ["sourceNpcId", "characterId"] as const;

/**
 * Match comments by any shared stable identity. The overlap check intentionally
 * handles legacy records that only persisted a characterId or relationId.
 * Comments without a stable actor id are user/legacy content and are not capped.
 */
export const isMomentCommentFromActor = (comment: MomentComment, actor: MomentCommentActor): boolean =>
  (comment.sourceNpcId !== undefined && actor.sourceNpcId !== undefined
    ? comment.sourceNpcId === actor.sourceNpcId
    : STABLE_ACTOR_FIELDS.some((field) => Boolean(comment[field] && actor[field] && comment[field] === actor[field])));

export const countMomentCommentsForActor = (
  comments: readonly MomentComment[],
  actor: MomentCommentActor,
): number => comments.filter((comment) => isMomentCommentFromActor(comment, actor)).length;

export const hasReachedMomentCommentLimit = (
  comments: readonly MomentComment[],
  actor: MomentCommentActor,
  limit = MAX_MOMENT_COMMENTS_PER_ACTOR,
): boolean => countMomentCommentsForActor(comments, actor) >= limit;

/**
 * Keep existing order and preserve user comments. A small union-find-like pass
 * groups records by overlapping stable ids so old partial metadata is capped too.
 */
export const limitMomentCommentsPerActor = (
  comments: readonly MomentComment[],
  limit = MAX_MOMENT_COMMENTS_PER_ACTOR,
): MomentComment[] => {
  const groups: Array<{ representative: MomentComment; count: number }> = [];
  const kept: MomentComment[] = [];
  for (const comment of comments) {
    const group = groups.find((candidate) => isMomentCommentFromActor(comment, candidate.representative));
    if (!group) {
      if (STABLE_ACTOR_FIELDS.some((field) => Boolean(comment[field]))) {
        groups.push({ representative: comment, count: 1 });
      }
      kept.push(comment);
      continue;
    }
    if (group.count >= limit) continue;
    group.count += 1;
    group.representative = {
      ...group.representative,
      sourceNpcId: group.representative.sourceNpcId || comment.sourceNpcId,
      characterId: group.representative.characterId || comment.characterId,
    };
    kept.push(comment);
  }
  return kept;
};
