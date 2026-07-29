import { useEffect, useRef } from "react";
import type { ForumActivityRuntimeContext } from "../services/forumActivityRuntime";
import { FORUM_ACTIVITY_CHECK_MIN_MS } from "../services/forumActivityService";
import { runAutomaticForumActivityCheck } from "../services/forumActivityRuntime";

/** Runs only while the forum root is mounted and the document is visible. */
export const useForumActivityEngine = (context: ForumActivityRuntimeContext): void => {
  const contextRef = useRef(context);
  contextRef.current = context;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let inFlight = false;
    const schedule = () => {
      if (disposed || typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, FORUM_ACTIVITY_CHECK_MIN_MS);
    };
    const tick = async () => {
      if (disposed || inFlight || typeof document !== "undefined" && document.visibilityState !== "visible") return;
      inFlight = true;
      try { await runAutomaticForumActivityCheck(contextRef.current); }
      finally { inFlight = false; schedule(); }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" && timer) clearTimeout(timer);
      if (document.visibilityState === "visible") schedule();
    };
    if (typeof document === "undefined" || document.visibilityState === "visible") void tick();
    document?.addEventListener?.("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      document?.removeEventListener?.("visibilitychange", onVisibilityChange);
    };
  }, [context.ownerIdentityId]);
};
