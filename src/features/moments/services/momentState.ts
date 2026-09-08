import type { Moment } from "../../../types";
import { limitMomentCommentsPerActor } from "./momentCommentLimit";

/**
 * Inserts a new Moment at the top, but keeps an existing Moment at its
 * original feed position when background metadata or an image is updated.
 */
export function upsertMomentPreservingOrder(moments: readonly Moment[], normalized: Moment): Moment[] {
  const existing = moments.find((moment) => moment.id === normalized.id);
  if (!existing) return [{ ...normalized, comments: limitMomentCommentsPerActor(normalized.comments) }, ...moments];

  const comments = [...existing.comments];
  for (const comment of normalized.comments) {
    const index = comments.findIndex((candidate) => candidate.id === comment.id);
    if (index >= 0) comments[index] = comment;
    else comments.push(comment);
  }

  return moments.map((moment) => moment.id === normalized.id
    ? {
        ...existing,
        ...normalized,
        likes: [...new Set([...existing.likes, ...normalized.likes])],
        comments: limitMomentCommentsPerActor(comments),
      }
    : moment);
}
