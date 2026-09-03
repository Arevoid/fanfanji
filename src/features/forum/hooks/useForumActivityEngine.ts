import { useRef } from "react";
import { useBackgroundScheduler } from "../../../core/scheduler/useBackgroundScheduler";
import type { ForumActivityRuntimeContext } from "../services/forumActivityRuntime";
import { FORUM_ACTIVITY_CHECK_MIN_MS } from "../services/forumActivityService";
import { runAutomaticForumActivityCheck } from "../services/forumActivityRuntime";

/** Runs only while the forum root is mounted and the document is visible. */
export const useForumActivityEngine = (context: ForumActivityRuntimeContext): void => {
  const contextRef = useRef(context);
  contextRef.current = context;
  useBackgroundScheduler({
    id: `forum-activity-${context.ownerIdentityId}`,
    enabled: Boolean(context.ownerIdentityId),
    intervalMs: FORUM_ACTIVITY_CHECK_MIN_MS,
    initialDelayMs: 0,
    taskType: "forum-activity",
    reason: "scheduled-forum-activity-check",
    recoveryPayload: { ownerIdentityId: context.ownerIdentityId, scope: "public-forum" },
    run: async () => { await runAutomaticForumActivityCheck(contextRef.current); },
    pauseWhenHidden: true,
  });
};
