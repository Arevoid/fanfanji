export const COMMON_APP_PRELOAD_ORDER = ["chat", "offline", "archives", "worldbook", "relationship-network", "forum", "reading"] as const;

/** Share the exact import promise between pointer intent, idle work and rendering. */
export function cachedModule<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => pending ||= load().catch(error => { pending = undefined; throw error; });
}

export function startAppPreloading(options: {
  load: (id: string) => Promise<unknown>;
  schedule: (work: () => void) => () => void;
  allowed: () => boolean;
  order?: readonly string[];
}) {
  const queue = [...(options.order || COMMON_APP_PRELOAD_ORDER)];
  let stopped = false;
  let busy = false;
  let cancel: (() => void) | undefined;
  const wake = () => {
    if (stopped || busy || cancel || !queue.length || !options.allowed()) return;
    cancel = options.schedule(() => {
      cancel = undefined;
      if (stopped || !options.allowed()) return;
      const id = queue.shift();
      if (!id) return;
      busy = true;
      // A failed warm-up never mounts an app or blocks subsequent groups.
      void options.load(id).catch(() => undefined).finally(() => { busy = false; wake(); });
    });
  };
  wake();
  return { wake, stop: () => { stopped = true; cancel?.(); cancel = undefined; } };
}
