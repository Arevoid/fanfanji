import assert from "node:assert/strict";
import { normalizeIdentitySettings } from "../src/core/storage/repositories/settingsRepository";
import { getRootIdentityId, listIdentitiesForRoot, listIdentityRoots, listRelationshipsForIdentityWorkspace, normalizeRelationshipIdentityScopes, sortIdentitiesForDisplay, type CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { UserSettings } from "../src/types";

const settings = {
  name: "主号",
  avatar: "primary-avatar",
  signature: "",
  bio: "",
  apiKey: "",
  selectedModel: "",
  wallpaper: "",
  customIcons: {},
  bubbleCss: "",
  globalCss: "",
  activePreset: "default",
  activeIdentityId: "identity-primary",
  identities: [
    { id: "identity-primary", name: "主号", avatar: "primary-avatar", signature: "", bio: "" },
    { id: "identity-alias", name: "老莫", avatar: "alias-avatar", signature: "", bio: "", kind: "alias" as const, parentIdentityId: "identity-primary" },
    { id: "identity-other", name: "另一个人设", avatar: "other-avatar", signature: "", bio: "" },
  ],
} as UserSettings;

const normalized = normalizeIdentitySettings(settings);
assert.equal(normalized.changed, true, "legacy identities need a one-time ownership normalization");
assert.equal(normalized.settings.identityDataVersion, 2);
assert.equal(normalized.settings.identities?.find((item) => item.id === "identity-primary")?.kind, "primary");
assert.equal(normalized.settings.identities?.find((item) => item.id === "identity-primary")?.rootIdentityId, "identity-primary");
assert.equal(normalized.settings.identities?.find((item) => item.id === "identity-alias")?.rootIdentityId, "identity-primary");
assert.equal(normalized.settings.identities?.find((item) => item.id === "identity-other")?.rootIdentityId, "identity-other");
assert.equal(getRootIdentityId("identity-alias", normalized.settings.identities), "identity-primary");
assert.deepEqual(
  sortIdentitiesForDisplay(normalized.settings.identities || []).map((item) => item.id),
  ["identity-primary", "identity-alias", "identity-other"],
  "identity managers should have a stable, persisted order",
);
assert.deepEqual(
  listIdentitiesForRoot(normalized.settings.identities || [], "identity-primary").map((item) => item.id),
  ["identity-primary", "identity-alias"],
  "a主人设 root should expose its primary identity and aliases",
);
assert.deepEqual(
  listIdentityRoots(normalized.settings.identities || []).map((item) => item.id),
  ["identity-primary", "identity-other"],
  "roots should be deduplicated without merging unrelated legacy identities",
);

const relation = {
  id: "relation-alias",
  characterId: "character-a",
  userIdentityId: "identity-alias",
  conversationId: "direct:relation-alias",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
} satisfies CharacterRelationship;
const relationResult = normalizeRelationshipIdentityScopes([relation], normalized.settings.identities);
assert.equal(relationResult.changed, true);
assert.equal(relationResult.relationships[0].id, relation.id, "normalization must never replace relation IDs");
assert.equal(relationResult.relationships[0].userIdentityId, relation.userIdentityId, "normalization must never reassign relation ownership");
assert.equal(relationResult.relationships[0].rootIdentityId, "identity-primary");

const alreadyNormalized = normalizeRelationshipIdentityScopes(relationResult.relationships, normalized.settings.identities);
assert.equal(alreadyNormalized.changed, false, "normalization must be idempotent");

const primaryRelation = { ...relation, id: "relation-primary", userIdentityId: "identity-primary" } satisfies CharacterRelationship;
const unrelatedRelation = { ...relation, id: "relation-other", userIdentityId: "identity-other" } satisfies CharacterRelationship;
const workspaceRelations = listRelationshipsForIdentityWorkspace(
  [relationResult.relationships[0], primaryRelation, unrelatedRelation],
  "identity-primary",
  normalized.settings.identities,
);
assert.deepEqual(workspaceRelations.map((item) => item.id), ["relation-alias", "relation-primary"], "workspace list includes primary and aliases but not another主人设");

const archivedActive = normalizeIdentitySettings({
  ...normalized.settings,
  identityDataVersion: 1,
  activeIdentityId: "identity-alias",
  name: "老莫",
  avatar: "alias-avatar",
  identities: (normalized.settings.identities || []).map((identity) => identity.id === "identity-alias"
    ? { ...identity, archived: true }
    : identity),
});
assert.equal(archivedActive.settings.activeIdentityId, "identity-primary", "an archived active identity must fall back to a usable identity");
assert.equal(archivedActive.settings.identities?.find((identity) => identity.id === "identity-alias")?.archived, true, "archive state must be preserved");
assert.equal(archivedActive.settings.identities?.find((identity) => identity.id === "identity-alias")?.rootIdentityId, "identity-primary", "archive migration must preserve the identity root");

const allArchived = normalizeIdentitySettings({
  ...normalized.settings,
  activeIdentityId: "identity-alias",
  identities: (normalized.settings.identities || []).map((identity) => ({ ...identity, archived: true })),
});
assert.equal(allArchived.settings.activeIdentityId, "identity-alias", "when every identity is archived, preserve the imported pointer without mutating archive state");
assert.ok(allArchived.settings.identities?.every((identity) => identity.archived), "all-archived recovery must not unarchive records");

console.log("identity workspace foundation tests passed");
