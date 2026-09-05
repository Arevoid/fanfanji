export type PublicShareAuthorizationStatus = "authorized" | "revoked";

/** A narrow destination scope for an explicit public-share grant. */
export type PublicShareScope = "moment" | "forum" | "public" | string;

export interface PublicShareAuthorization {
  id: string;
  sourceEventId: string;
  relationId: string;
  characterId: string;
  userIdentityId: string;
  scope: PublicShareScope;
  status: PublicShareAuthorizationStatus;
  createdAt: number;
}

export interface PublicShareAuthorizationTarget {
  sourceEventId: string;
  relationId: string;
  characterId: string;
  userIdentityId: string;
  scope: PublicShareScope;
}

export interface PublicShareAuthorizationDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Pure, deny-by-default authorization check for a public projection. The
 * source event and the complete relationship scope must match exactly.
 */
export const evaluatePublicShareAuthorization = (
  authorization: PublicShareAuthorization | undefined,
  target: PublicShareAuthorizationTarget,
): PublicShareAuthorizationDecision => {
  if (!authorization) return { allowed: false, reason: "missing_authorization" };
  if (authorization.status !== "authorized") return { allowed: false, reason: "authorization_revoked" };
  if (authorization.scope !== target.scope) return { allowed: false, reason: "scope_mismatch" };
  if (authorization.sourceEventId !== target.sourceEventId) return { allowed: false, reason: "source_event_mismatch" };
  if (
    authorization.relationId !== target.relationId
    || authorization.characterId !== target.characterId
    || authorization.userIdentityId !== target.userIdentityId
  ) return { allowed: false, reason: "relation_scope_mismatch" };
  return { allowed: true, reason: "authorized" };
};

export const isPublicShareAuthorized = (
  authorization: PublicShareAuthorization | undefined,
  target: PublicShareAuthorizationTarget,
): boolean => evaluatePublicShareAuthorization(authorization, target).allowed;
