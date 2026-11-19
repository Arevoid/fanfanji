import assert from "node:assert/strict";
import type { Character, OfflineStory } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { canAccessOfflineStoryFromCurrentRelation, isGroupOfflineStory, resolveOfflineRelationChoices, resolveOfflineStoryDirectoryCharacterIds } from "../src/features/offline/services/offlineStoryWorkspaceScope";
import { readFileSync } from "node:fs";

const directCharacter = { id: "char-direct", name: "角色", isGroupChat: false } as Character;
const groupCharacter = { id: "char-group", name: "群聊", isGroupChat: true, ownerIdentityId: "identity-2" } as Character;
const characters = [directCharacter, groupCharacter];
const relation = { id: "relation-1", characterId: directCharacter.id, userIdentityId: "identity-1" } as CharacterRelationship;
const relationChoices = resolveOfflineRelationChoices([relation], directCharacter.id, "identity-1");
const directStory = { id: "story-direct", characterId: directCharacter.id, relationId: relation.id, messages: [] } as OfflineStory;
const groupStory = { id: "story-group", characterId: groupCharacter.id, characterIds: ["member-a", "member-b"], messages: [] } as OfflineStory;
const ordinaryContainer = { id: "char-container", name: "误用容器", ownerIdentityId: "identity-1" } as Character;
const memberA = { id: "member-a", name: "成员 A" } as Character;
const memberB = { id: "member-b", name: "成员 B" } as Character;
const ordinaryContainerStory = { id: "story-ordinary-container", characterId: ordinaryContainer.id, characterIds: [memberA.id, memberB.id], messages: [] } as OfflineStory;
const allCharacters = [...characters, ordinaryContainer, memberA, memberB];

assert.equal(relationChoices.length, 1, "relation choices keep one scoped relation");
assert.equal(isGroupOfflineStory(groupStory, characters), true, "group story is recognized by group owner");
assert.equal(isGroupOfflineStory(directStory, characters), false, "direct story is not recognized as group");
assert.deepEqual(
  resolveOfflineStoryDirectoryCharacterIds(ordinaryContainerStory, allCharacters),
  [memberA.id, memberB.id],
  "ordinary container must not become a multi-story directory bucket",
);
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

const workspaceSource = readFileSync(new URL("../src/features/offline/hooks/useOfflineWorkspaceScope.ts", import.meta.url), "utf8");
assert.match(workspaceSource, /activeRelationCharacterIds/, "offline character picker derives visibility from the exact identity relations");
assert.match(workspaceSource, /character\.isGroupChat/, "group containers remain scoped by their owner identity");

console.log("6 offline workspace scope checks passed");
