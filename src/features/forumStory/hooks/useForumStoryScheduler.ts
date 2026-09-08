import { useRef } from "react";
import { useBackgroundScheduler } from "../../../core/scheduler/useBackgroundScheduler";
import type { UserSettings } from "../../../types";
import { runForumStorySchedulerTick } from "../services/forumStorySchedulerService";

interface UseForumStorySchedulerOptions {
  settings: UserSettings;
  onChanged?: () => void;
}

/** Runs public forum-story progression through the durable scheduler boundary. */
export function useForumStoryScheduler({ settings, onChanged }: UseForumStorySchedulerOptions): void {
  const contextRef = useRef({ settings, onChanged });
  contextRef.current = { settings, onChanged };
  useBackgroundScheduler({
    id: "forum-story-progression",
    enabled: true,
    intervalMs: 15 * 60 * 1000,
    initialDelayMs: 30 * 1000,
    taskType: "forum-story-progression",
    reason: "scheduled-forum-story-progression",
    recoveryPayload: { scope: "public-forum-story" },
    pauseWhenHidden: true,
    pauseWhenOffline: true,
    run: async () => {
      const result = await runForumStorySchedulerTick({
        now: Date.now(),
        runnerContext: { settings: contextRef.current.settings },
      });
      if (result.executed > 0) contextRef.current.onChanged?.();
    },
  });
}
