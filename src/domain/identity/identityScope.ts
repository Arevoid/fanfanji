import type { UserIdentity } from "../../types";

export const LEGACY_PRIMARY_IDENTITY_ID = "identity-1";

export type IdentityScopeMode = "identity" | "primary" | "shared";

/**
 * The single identity contract used by identity-aware applications.
 *
 * `selectedIdentityId` is the exact persona whose private data is being read.
 * `rootIdentityId` only groups a primary identity and its aliases; it never
 * widens private data visibility. `primaryIdentityId` is kept for explicitly
 * primary-owned surfaces such as the character phone.
 */
export interface IdentityScope {
  selectedIdentityId: string;
  rootIdentityId: string;
  primaryIdentityId: string;
  mode: IdentityScopeMode;
}

const usableIdentity = (identity: UserIdentity | undefined): UserIdentity | undefined =>
  identity && !identity.archived ? identity : undefined;

export function resolvePrimaryIdentityId(
  identityId: string,
  identities: readonly UserIdentity[] = [],
): string {
  const identity = identities.find((item) => item.id === identityId);
  if (identity?.kind === "alias" && identity.parentIdentityId) return identity.parentIdentityId;

  const rootIdentityId = identity?.rootIdentityId || identityId;
  const primary = identities.find((item) =>
    item.id === rootIdentityId
    && item.kind !== "alias"
    && !item.archived,
  ) || identities.find((item) =>
    (item.rootIdentityId || item.id) === rootIdentityId
    && item.kind !== "alias"
    && !item.archived,
  );
  return primary?.id || rootIdentityId || LEGACY_PRIMARY_IDENTITY_ID;
}

export function resolveRootIdentityId(
  identityId: string,
  identities: readonly UserIdentity[] = [],
): string {
  return identities.find((item) => item.id === identityId)?.rootIdentityId || identityId;
}

export function createIdentityScope(
  selectedIdentityId: string | undefined,
  identities: readonly UserIdentity[] = [],
  mode: IdentityScopeMode = "identity",
): IdentityScope {
  const requested = selectedIdentityId || LEGACY_PRIMARY_IDENTITY_ID;
  const selected = usableIdentity(identities.find((item) => item.id === requested));
  const selectedId = selected?.id || requested;
  return {
    selectedIdentityId: selectedId,
    rootIdentityId: resolveRootIdentityId(selectedId, identities),
    primaryIdentityId: resolvePrimaryIdentityId(selectedId, identities),
    mode,
  };
}

/** Exact private identity matching. Root identities are intentionally not interchangeable. */
export function matchesIdentityScope(
  recordIdentityId: string | undefined,
  scope: IdentityScope,
): boolean {
  if (scope.mode === "shared") return true;
  const expected = scope.mode === "primary" ? scope.primaryIdentityId : scope.selectedIdentityId;
  return (recordIdentityId || LEGACY_PRIMARY_IDENTITY_ID) === expected;
}
