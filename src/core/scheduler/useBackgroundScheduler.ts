import { useEffect, useRef } from "react";
import { BackgroundScheduler, type BackgroundTaskSnapshot } from "./backgroundScheduler";

interface UseBackgroundSchedulerOptions {
  id: string;
  enabled: boolean;
  intervalMs: number;
  initialDelayMs?: number;
  run: () => void | Promise<void>;
  onState?: (snapshot: BackgroundTaskSnapshot) => void;
}

export function useBackgroundScheduler({ id, enabled, intervalMs, initialDelayMs, run, onState }: UseBackgroundSchedulerOptions): void {
  const runRef = useRef(run);
  const onStateRef = useRef(onState);
  runRef.current = run;
  onStateRef.current = onState;

  useEffect(() => {
    if (!enabled) return undefined;
    const scheduler = new BackgroundScheduler({
      id,
      intervalMs,
      initialDelayMs,
      run: () => runRef.current(),
    });
    scheduler.start();
    onStateRef.current?.(scheduler.getSnapshot());
    return () => {
      scheduler.stop();
      onStateRef.current?.(scheduler.getSnapshot());
    };
  }, [enabled, id, intervalMs, initialDelayMs]);
}
