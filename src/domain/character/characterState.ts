/**
 * Canonical, non-persistent character-state vocabulary.
 *
 * Identity always resolves to the archive character ID. Relationship, scene,
 * event and memory facts are deliberately separate: a recalled past event
 * cannot silently change the current scene or relationship.
 */
export type CharacterRelationshipState =
  | "unknown"
  | "friend"
  | "close_friend"
  | "ambiguous"
  | "partner";

export type CharacterSceneState =
  | "online_chat"
  | "offline_story"
  | "imagined_scene"
  | "memory_recall";

export type CharacterEventState =
  | "event_history"
  | "active_context"
  | "future_intention";

export interface CharacterStateBoundary {
  characterId: string;
  relationship: CharacterRelationshipState;
  scene: CharacterSceneState;
}

export const DEFAULT_ONLINE_CHARACTER_STATE: Omit<CharacterStateBoundary, "characterId"> = {
  relationship: "unknown",
  scene: "online_chat",
};

/** Relationship transitions require an explicit user, story, or system event. */
export function canTransitionRelationship(
  current: CharacterRelationshipState,
  next: CharacterRelationshipState,
  hasExplicitEvent: boolean,
): boolean {
  return current === next || hasExplicitEvent;
}

/** A recalled fact is historical context, never evidence of current co-location. */
export function isSharedPhysicalScene(scene: CharacterSceneState): boolean {
  return scene === "offline_story" || scene === "imagined_scene";
}
