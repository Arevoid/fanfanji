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

/**
 * A single observation is one fixed moment, not a time-lapse montage. Some
 * providers still add clock headings when asked for a long, detailed scene.
 * Keep only the first clock-delimited block so one generated record cannot
 * silently describe several hours in one entry.
 */
const CLOCK_HEADING_RE = /(?:^|\n)\s*(?:观察时间\s*)?(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:至|到|-|—|–)\s*(?:[01]?\d|2[0-3]):[0-5]\d)?\s*(?:[，,:：—–-]\s*)?/g;

export const normalizeSingleMomentContent = (content: string): string => {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  const headings = [...normalized.matchAll(CLOCK_HEADING_RE)];
  if (headings.length < 2) {
    return normalized.replace(CLOCK_HEADING_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  const firstBlock = normalized.slice(0, headings[1].index ?? normalized.length);
  return firstBlock.replace(CLOCK_HEADING_RE, "").replace(/\n{3,}/g, "\n\n").trim();
};
