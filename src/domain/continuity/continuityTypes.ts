import type { CharacterSceneState } from "../character/characterState";

export const CONTINUITY_RUNTIME_SCHEMA_VERSION = 1 as const;

/** The ownership boundary shared by every continuity-runtime record. */
export interface ContinuityScope {
  characterId: string;
  relationId: string;
  userIdentityId: string;
  conversationId?: string;
}

export type ContinuityApp =
  | "chat"
  | "offline"
  | "diary"
  | "moments"
  | "character_phone"
  | "forum"
  | "browser"
  | "reading";

export type ContinuityScene = CharacterSceneState;

export const isContinuityScope = (value: unknown): value is ContinuityScope => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.characterId === "string"
    && candidate.characterId.trim().length > 0
    && typeof candidate.relationId === "string"
    && candidate.relationId.trim().length > 0
    && typeof candidate.userIdentityId === "string"
    && candidate.userIdentityId.trim().length > 0
    && (candidate.conversationId === undefined
      || (typeof candidate.conversationId === "string" && candidate.conversationId.trim().length > 0));
};

export const sameContinuityScope = (
  left: Pick<ContinuityScope, "characterId" | "relationId" | "userIdentityId" | "conversationId">,
  right: Pick<ContinuityScope, "characterId" | "relationId" | "userIdentityId" | "conversationId">,
): boolean => left.characterId === right.characterId
  && left.relationId === right.relationId
  && left.userIdentityId === right.userIdentityId
  && (!left.conversationId || !right.conversationId || left.conversationId === right.conversationId);

export const copyContinuityScope = (scope: ContinuityScope): ContinuityScope => ({
  characterId: scope.characterId,
  relationId: scope.relationId,
  userIdentityId: scope.userIdentityId,
  ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
});
