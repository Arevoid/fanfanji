import type {
  PublicCharacterEventCandidate,
  PublicCognitiveVisibility,
  PublicWorldSettingCandidate,
} from "./publicForumCognitiveTypes";

export interface PublicVisibilityCandidate {
  visibility?: PublicCognitiveVisibility;
}

/** Unknown, relationship-scoped, and private sources are denied by default. */
export function canExposeToPublicContext(candidate: PublicVisibilityCandidate | undefined): boolean {
  return candidate?.visibility === "public";
}

export const selectPublicEvents = (
  events: readonly PublicCharacterEventCandidate[],
) => events
  .filter(canExposeToPublicContext)
  .map(({ event }) => ({
    kind: event.kind,
    summary: event.summary,
    occurredAt: event.occurredAt,
    confidence: event.confidence,
  }));

export const selectPublicWorldSettings = (
  settings: readonly PublicWorldSettingCandidate[],
) => settings
  .filter(canExposeToPublicContext)
  .map(({ title, content }) => ({ title, content }));
