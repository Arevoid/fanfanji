import assert from "node:assert/strict";
import { getRootIdentityId } from "../src/domain/relationship/characterRelationship";
import { repairLegacyCharacterPhoneOwnership } from "../src/features/characterPhone/characterPhoneOwnership";
import type { Character, UserIdentity } from "../src/types";

const primary: UserIdentity = {
  id: "primary",
  name: "主身份",
  avatar: "",
  signature: "",
  bio: "",
  kind: "primary",
};
const alias: UserIdentity = {
  id: "alias",
  name: "马甲",
  avatar: "",
  signature: "",
  bio: "",
  kind: "alias",
  rootIdentityId: primary.id,
};
const other: UserIdentity = {
  id: "other",
  name: "另一身份",
  avatar: "",
  signature: "",
  bio: "",
  kind: "primary",
};
const character = (id: string, ownerIdentityId?: string): Character => ({
  id,
  name: id,
  avatar: "",
  personality: "",
  backstory: "",
  ...(ownerIdentityId ? { ownerIdentityId } : {}),
});

assert.equal(getRootIdentityId(alias.id, [primary, alias]), primary.id, "legacy rootIdentityId should resolve aliases to their primary");

const repaired = repairLegacyCharacterPhoneOwnership({
  characters: [character("unambiguous"), character("shared"), character("already-owned", other.id)],
  relationships: [{
    id: "relation",
    characterId: "unambiguous",
    userIdentityId: alias.id,
    rootIdentityId: primary.id,
    conversationId: "direct:relation",
    relationship: "friend",
    createdAt: 1,
    updatedAt: 1,
  }],
  phones: [
    { characterId: "unambiguous", ownerIdentityId: primary.id },
    { characterId: "shared", ownerIdentityId: primary.id },
    { characterId: "shared", ownerIdentityId: other.id },
  ],
  identities: [primary, alias, other],
});

assert.equal(repaired.changed, true);
assert.equal(repaired.characters.find((item) => item.id === "unambiguous")?.ownerIdentityId, primary.id);
assert.equal(repaired.characters.find((item) => item.id === "shared")?.ownerIdentityId, undefined, "shared legacy characters must not be assigned arbitrarily");
assert.equal(repaired.characters.find((item) => item.id === "already-owned")?.ownerIdentityId, other.id);
assert.deepEqual(repaired.repairedCharacterIds, ["unambiguous"]);

console.log("characterPhoneOwnership.test.ts passed");
