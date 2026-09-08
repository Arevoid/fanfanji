import assert from "node:assert/strict";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { removeRelationshipData } from "../src/domain/relationship/relationshipCleanup";
import {
  countOfflineStoriesForRelation,
  resolveOfflineStoryRelationId,
} from "../src/domain/relationship/offlineStoryScope";
import type { Character, OfflineStory } from "../src/types";

const characterA: Character = { id: "character-a", name: "A", avatar: "", personality: "", backstory: "" };
const characterB: Character = { id: "character-b", name: "B", avatar: "", personality: "", backstory: "" };
const group: Character = { id: "group-1", name: "Group", avatar: "", personality: "", backstory: "", isGroupChat: true };
const relationA = createRelationship({ id: "relation-a", characterId: characterA.id, userIdentityId: "identity-a", now: 1 });
const relationB = createRelationship({ id: "relation-b", characterId: characterA.id, userIdentityId: "identity-b", now: 2 });
const defaultRelation = createRelationship({ id: "relation-default", characterId: characterA.id, userIdentityId: "identity-1", now: 3 });

const story = (id: string, characterId: string, relationId?: string, characterIds?: string[]): OfflineStory => ({
  id,
  characterId,
  ...(relationId ? { relationId } : {}),
  title: id,
  createdAt: 1,
  updatedAt: 1,
  mode: "continue",
  characterIds,
  messages: [],
});

const directA = story("story-a", characterA.id, relationA.id, [characterA.id]);
const directB = story("story-b", characterA.id, relationB.id, [characterA.id]);
const legacyDirect = story("legacy-direct", characterA.id, undefined, [characterA.id]);
const groupStory = story("group-story", group.id, undefined, [characterA.id, characterB.id]);
const allStories = [directA, directB, legacyDirect, groupStory];

assert.equal(
  countOfflineStoriesForRelation({
    stories: allStories,
    relationId: relationA.id,
    characterId: characterA.id,
    relationships: [relationA, relationB, defaultRelation],
    characters: [characterA, characterB, group],
  }),
  1,
  "identity A only counts its relation-owned story",
);
assert.equal(
  countOfflineStoriesForRelation({
    stories: allStories,
    relationId: relationB.id,
    characterId: characterA.id,
    relationships: [relationA, relationB, defaultRelation],
    characters: [characterA, characterB, group],
  }),
  1,
  "identity B only counts its relation-owned story",
);
assert.equal(
  countOfflineStoriesForRelation({
    stories: [legacyDirect],
    relationId: defaultRelation.id,
    characterId: characterA.id,
    relationships: [defaultRelation],
    characters: [characterA, group],
  }),
  1,
  "legacy direct story resolves only to the historical primary identity",
);
assert.equal(resolveOfflineStoryRelationId(groupStory, [relationA], [characterA, group]), undefined);

const afterRelationDelete = removeRelationshipData({
  relationships: [relationA, relationB, defaultRelation],
  messages: [],
  memories: [],
  offlineStories: allStories,
}, [relationA.id]);
assert.deepEqual(afterRelationDelete.offlineStories.map((item) => item.id).sort(), ["group-story", "legacy-direct", "story-b"]);
assert.deepEqual(
  afterRelationDelete.offlineStories.find((item) => item.id === "group-story")?.characterIds,
  [characterB.id],
  "deleting relation A removes A's residual group participant reference",
);

const afterDefaultDelete = removeRelationshipData({
  relationships: [defaultRelation],
  messages: [],
  memories: [],
  offlineStories: [legacyDirect],
}, [defaultRelation.id]);
assert.equal(afterDefaultDelete.offlineStories.length, 0, "legacy direct story is cleaned with its historical default relation");

console.log("PASS OfflineStory relation-priority counts, group reference cleanup, and legacy compatibility");
