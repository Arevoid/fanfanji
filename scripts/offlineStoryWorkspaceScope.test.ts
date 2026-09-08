import assert from "node:assert/strict";
import type { Character, OfflineStory } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { canAccessOfflineStoryFromCurrentRelation, isGroupOfflineStory, resolveOfflineRelationChoices } from "../src/features/offline/services/offlineStoryWorkspaceScope";

const directCharacter = { id: "char-direct", name: "角色", isGroupChat: false } as Character;
const groupCharacter = { id: "char-group", name: "群聊", isGroupChat: true, ownerIdentityId: "identity-2" } as Character;
const characters = [directCharacter, groupCharacter];
const relation = { id: "relation-1", characterId: directCharacter.id, userIdentityId: "identity-1" } as CharacterRelationship;
const relationChoices = resolveOfflineRelationChoices([relation], directCharacter.id, "identity-1");
const directStory = { id: "story-direct", characterId: directCharacter.id, relationId: relation.id, messages: [] } as OfflineStory;
const groupStory = { id: "story-group", characterId: groupCharacter.id, characterIds: ["member-a", "member-b"], messages: [] } as OfflineStory;

assert.equal(relationChoices.length, 1, "relation choices keep one scoped relation");
assert.equal(isGroupOfflineStory(groupStory, characters), true, "group story is recognized by group owner");
assert.equal(isGroupOfflineStory(directStory, characters), false, "direct story is not recognized as group");
assert.equal(canAccessOfflineStoryFromCurrentRelation({
  story: directStory,
  characters,
  selectedRelationId: relation.id,
  relationChoices,
  activeIdentityId: "identity-1",
}), true, "direct story remains relation scoped");
assert.equal(canAccessOfflineStoryFromCurrentRelation({
  story: directStory,
  characters,
  selectedRelationId: "other-relation",
  relationChoices,
  activeIdentityId: "identity-1",
}), false, "direct story cannot cross relation scope");
assert.equal(canAccessOfflineStoryFromCurrentRelation({
  story: groupStory,
  characters,
  selectedRelationId: "",
  relationChoices: [],
  activeIdentityId: "identity-2",
}), true, "group story remains identity scoped without a direct relation");
assert.equal(canAccessOfflineStoryFromCurrentRelation({
  story: groupStory,
  characters,
  selectedRelationId: "",
  relationChoices: [],
  activeIdentityId: "identity-1",
}), false, "group story cannot cross identity scope");

console.log("6 offline workspace scope checks passed");
