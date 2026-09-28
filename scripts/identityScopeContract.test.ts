import assert from "node:assert/strict";
import type { UserIdentity } from "../src/types";
import { createIdentityScope, matchesIdentityScope, resolvePrimaryIdentityId, resolveRootIdentityId } from "../src/domain/identity/identityScope";

const identities: UserIdentity[] = [
  { id: "primary", name: "主身份", avatar: "", signature: "", bio: "", kind: "primary", rootIdentityId: "primary" },
  { id: "alias", name: "别名", avatar: "", signature: "", bio: "", kind: "alias", rootIdentityId: "primary", parentIdentityId: "primary" },
  { id: "other", name: "另一身份", avatar: "", signature: "", bio: "", kind: "primary", rootIdentityId: "other" },
];

assert.equal(resolveRootIdentityId("alias", identities), "primary");
assert.equal(resolvePrimaryIdentityId("alias", identities), "primary");
assert.equal(resolvePrimaryIdentityId("other", identities), "other");

const aliasScope = createIdentityScope("alias", identities);
assert.deepEqual(aliasScope, {
  selectedIdentityId: "alias",
  rootIdentityId: "primary",
  primaryIdentityId: "primary",
  mode: "identity",
});
assert.equal(matchesIdentityScope("alias", aliasScope), true);
assert.equal(matchesIdentityScope("primary", aliasScope), false, "aliases do not widen private scope");
assert.equal(matchesIdentityScope(undefined, createIdentityScope("identity-1", [])), true, "legacy unscoped records remain readable by the historical primary");
assert.equal(matchesIdentityScope("primary", { ...aliasScope, mode: "primary" }), true, "primary mode compares against the owning primary");
assert.equal(matchesIdentityScope("other", aliasScope), false);
assert.equal(matchesIdentityScope("anything", { ...aliasScope, mode: "shared" }), true);

console.log("identity scope contract tests passed");
