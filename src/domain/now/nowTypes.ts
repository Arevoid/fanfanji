export type NowSceneSource = "ai" | "local-fallback";
export type NowActionType = "moving" | "still" | "transition" | "out-of-view";
export type NowContinuityMode = "continue" | "no-change" | "transition";

export interface NowScene {
  id: string;
  threadId: string;
  ownerIdentityId: string;
  characterId: string;
  storyAt: number;
  durationMinutes: number;
  location: string;
  environment: string;
  content: string;
  source: NowSceneSource;
  createdAt: number;
  /** Visible action classification used by the monitoring-style timeline. */
  actionType?: NowActionType;
  /** Whether this record continues, preserves, or naturally changes the previous state. */
  continuityMode?: NowContinuityMode;
  /** Short label shown above the detailed observation. */
  actionSummary?: string;
  /** Fictional camera/location label shown in the monitor overlay. */
  cameraLabel?: string;
  /** Small, directly observable changes in this interval. */
  visibleChanges?: string[];
  /** Optional explanation for a natural transition, never a future prediction. */
  transitionReason?: string;
  previousSceneId?: string;
}

export interface NowObservationThread {
  id: string;
  ownerIdentityId: string;
  characterId: string;
  storyAt: number;
  createdAt: number;
  updatedAt: number;
  scenes: NowScene[];
}

export const isNowScene = (value: unknown): value is NowScene => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.threadId === "string"
    && typeof item.ownerIdentityId === "string"
    && typeof item.characterId === "string"
    && typeof item.storyAt === "number"
    && Number.isFinite(item.storyAt)
    && typeof item.durationMinutes === "number"
    && Number.isFinite(item.durationMinutes)
    && typeof item.location === "string"
    && typeof item.environment === "string"
    && typeof item.content === "string"
    && (item.source === "ai" || item.source === "local-fallback")
    && typeof item.createdAt === "number"
    && Number.isFinite(item.createdAt)
    && (item.actionType === undefined || item.actionType === "moving" || item.actionType === "still" || item.actionType === "transition" || item.actionType === "out-of-view")
    && (item.continuityMode === undefined || item.continuityMode === "continue" || item.continuityMode === "no-change" || item.continuityMode === "transition")
    && (item.actionSummary === undefined || typeof item.actionSummary === "string")
    && (item.cameraLabel === undefined || typeof item.cameraLabel === "string")
    && (item.visibleChanges === undefined || (Array.isArray(item.visibleChanges) && item.visibleChanges.every((change) => typeof change === "string")))
    && (item.transitionReason === undefined || typeof item.transitionReason === "string")
    && (item.previousSceneId === undefined || typeof item.previousSceneId === "string");
};

export const isNowObservationThread = (value: unknown): value is NowObservationThread => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.ownerIdentityId === "string"
    && typeof item.characterId === "string"
    && typeof item.storyAt === "number"
    && Number.isFinite(item.storyAt)
    && typeof item.createdAt === "number"
    && Number.isFinite(item.createdAt)
    && typeof item.updatedAt === "number"
    && Number.isFinite(item.updatedAt)
    && Array.isArray(item.scenes)
    && item.scenes.every(isNowScene);
};
