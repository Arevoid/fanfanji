/** Defer nonvisual work past first paint; cancellation never starts a paid job. */
export function deferForegroundTask(task: () => void, delay = 1000): () => void {
  if (typeof window === "undefined") return () => {};
  let stopped = false;
  let idle: number | undefined;
  const host = window as Window & { requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  const timer = window.setTimeout(() => {
    if (stopped) return;
    if (host.requestIdleCallback) idle = host.requestIdleCallback(() => { if (!stopped) task(); }, { timeout: 3000 });
    else if (!stopped) task();
  }, delay);
  return () => { stopped = true; window.clearTimeout(timer); if (idle !== undefined) host.cancelIdleCallback?.(idle); };
}
