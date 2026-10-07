import type { NowActionType, NowContinuityMode, NowScene } from "./nowTypes";

export interface NowCandidateObservation {
  actionType: NowActionType;
  continuityMode: NowContinuityMode;
  actionSummary: string;
  visibleChanges: string[];
  transitionReason?: string;
}

export const hasVisibleTransitionEvidence = (candidate: Pick<NowCandidateObservation, "visibleChanges" | "transitionReason">): boolean => (
  candidate.visibleChanges.some((change) => change.trim().length > 0)
  || Boolean(candidate.transitionReason?.trim())
);

/**
 * Keeps automatic observation passive. A transition without visible evidence is
 * downgraded to a continuation so generation cannot invent a new activity just
 * to make the timeline look busy.
 */
export const enforceNowContinuity = (
  previous: NowScene | undefined,
  candidate: NowCandidateObservation,
): NowCandidateObservation => {
  if (!previous || candidate.continuityMode !== "transition" || hasVisibleTransitionEvidence(candidate)) return candidate;
  return {
    actionType: previous.actionType || "still",
    continuityMode: "no-change",
    actionSummary: previous.actionSummary || "保持当前动作",
    visibleChanges: [],
  };
};

export const getNowActionLabel = (scene: Pick<NowScene, "actionType" | "continuityMode">): string => {
  if (scene.continuityMode === "no-change") return "画面无明显变化";
  if (scene.continuityMode === "transition") return "自然变化";
  if (scene.actionType === "out-of-view") return "离开画面";
  if (scene.actionType === "still") return "保持当前动作";
  return "有人活动";
};

