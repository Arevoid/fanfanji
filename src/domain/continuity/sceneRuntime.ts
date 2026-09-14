import type { ContinuityApp, ContinuityScene } from "./continuityTypes";

export interface SceneTransition {
  from: ContinuityScene;
  to: ContinuityScene;
  reason: string;
  changed: boolean;
}

/**
 * Scene is a runtime boundary, not a Memory projection. Online chat remains
 * the safe default; transitions into a shared physical scene require an
 * explicit caller signal.
 */
export function transitionScene(input: {
  current?: ContinuityScene;
  target: ContinuityScene;
  explicit: boolean;
  reason?: string;
}): SceneTransition {
  const from = input.current || "online_chat";
  const target = input.explicit ? input.target : "online_chat";
  return {
    from,
    to: target,
    reason: input.reason?.trim() || (target === from ? "no_change" : "explicit_scene_transition"),
    changed: from !== target,
  };
}

export function defaultSceneForApp(app: ContinuityApp): ContinuityScene {
  return app === "offline" ? "offline_story" : "online_chat";
}

export function isSharedPhysicalScene(scene: ContinuityScene): boolean {
  return scene === "offline_story" || scene === "imagined_scene";
}
