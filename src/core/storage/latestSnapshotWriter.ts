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
  let lastError: unknown = null;

  const enqueue = (value: T): Promise<void> => {
    // A new snapshot is an explicit recovery attempt after a previous write
    // failure. Keep the failure observable until flush() reports it, but do
    // not poison later successful writes.
    lastError = null;
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
      lastError = error;
      throw error;
    }).finally(() => {
      active = idle;
    });
    return active;
  };

  const flush = async (): Promise<void> => {
    // A caller may enqueue another snapshot while the current transaction is
    // settling. Keep observing the active promise until the writer is truly
    // idle so the completion boundary covers every snapshot queued before the
    // caller resumes.
    try {
      while (active !== idle) await active;
    } catch (error) {
      lastError = null;
      throw error;
    }
    if (lastError !== null) {
      const error = lastError;
      lastError = null;
      throw error;
    }
  };

  return { enqueue, flush };
}
