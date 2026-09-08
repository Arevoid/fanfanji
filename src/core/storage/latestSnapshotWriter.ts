/**
 * Serializes persistence while coalescing updates that arrive during an
 * in-flight write. Only the newest snapshot is needed because each snapshot
 * represents the complete state of one repository.
 */
export function createLatestSnapshotWriter<T>(
  clone: (value: T) => T,
  persist: (value: T) => Promise<void>,
): {
  enqueue: (value: T) => Promise<void>;
  flush: () => Promise<void>;
} {
  const idle = Promise.resolve();
  let active: Promise<void> = idle;
  let pending: T | null = null;

  const enqueue = (value: T): Promise<void> => {
    pending = clone(value);
    if (active !== idle) return active;

    active = (async () => {
      while (pending !== null) {
        const snapshot = pending;
        pending = null;
        await persist(snapshot);
      }
    })().catch((error) => {
      pending = null;
      throw error;
    }).finally(() => {
      active = idle;
    });
    return active;
  };

  return { enqueue, flush: () => active };
}
