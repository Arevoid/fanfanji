import type { MemoryItem, Moment } from "../../../types";

/**
 * Returns whether a Memory Vault item was created for the supplied Moment.
 *
 * New records use an explicit sourceMomentId. The timestamp/id fallback keeps
 * deletion compatible with generated Moment memories written before that link
 * existed, while leaving ordinary memories untouched.
 */
export const isMomentMemoryFor = (memory: MemoryItem, moment: Moment): boolean => {
  if (memory.sourceMomentId !== undefined) return memory.sourceMomentId === moment.id;
  if (!moment.characterId || memory.characterId !== moment.characterId || memory.timestamp !== moment.timestamp) return false;
  if (moment.relationId && memory.relationId !== moment.relationId) return false;
  return memory.id.startsWith(`${moment.timestamp}-moment-memory-`);
};

export const removeMemoriesForMoment = (memories: readonly MemoryItem[], moment: Moment): MemoryItem[] =>
  memories.filter((memory) => !isMomentMemoryFor(memory, moment));
