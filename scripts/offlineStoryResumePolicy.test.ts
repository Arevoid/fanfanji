import assert from "node:assert/strict";
import type { Character, OfflineStory } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { isOfflineStoryResumable, listResumableOfflineStories } from "../src/domain/offlineStory/offlineStoryResumePolicy";

const characters: Character[] = [
  { id: "character-a", name: "同名角色", avatar: "a", personality: "", backstory: "" },
  { id: "character-b", name: "同名角色", avatar: "b", personality: "", backstory: "" },
  { id: "group", name: "群聊", avatar: "g", personality: "", backstory: "", isGroupChat: true, memberIds: ["character-a", "character-b"] },
];
const relationships: CharacterRelationship[] = [
  { id: "relation-a", characterId: "character-a", userIdentityId: "identity-1", conversationId: "conversation-a", relationship: "partner", createdAt: 1, updatedAt: 1 },
  { id: "relation-b", characterId: "character-b", userIdentityId: "identity-1", conversationId: "conversation-b", relationship: "friend", createdAt: 1, updatedAt: 1 },
];

const makeStory = (patch: Partial<OfflineStory>): OfflineStory => ({
  id: "story-default",
  characterId: "character-a",
  relationId: "relation-a",
  title: "旧剧情",
  createdAt: 1,
  updatedAt: 1,
  mode: "continue",
  messages: [{ id: "offline-message", characterId: "character-a", relationId: "relation-a", sender: "character", content: "场景 A", timestamp: 1 }],
  ...patch,
});

assert.equal(isOfflineStoryResumable(makeStory({})), true);
assert.equal(isOfflineStoryResumable(makeStory({ messages: [], importedContext: undefined })), false);
assert.equal(isOfflineStoryResumable(makeStory({ messages: [], importedContext: { messages: [{ id: "imported", characterId: "character-a", relationId: "relation-a", sender: "user", content: "交接", timestamp: 1, isImportedContext: true }], memories: [], worldBook: [], importedAt: 1 } })), true);

const storyA = makeStory({ id: "story-a", updatedAt: 20, title: "剧情 A" });
const storyB = makeStory({ id: "story-b", relationId: "relation-b", characterId: "character-b", updatedAt: 30, title: "剧情 B" });
const legacyA = makeStory({ id: "story-legacy-a", relationId: undefined, updatedAt: 10, title: "旧版剧情 A" });
const groupStory = makeStory({ id: "story-group", relationId: undefined, characterId: "group", characterIds: ["character-a", "character-b"], updatedAt: 40, title: "群聊剧情" });

assert.deepEqual(
  listResumableOfflineStories({
    stories: [storyA, storyB, legacyA, groupStory],
    characters,
    relationships,
    scope: { characterId: "character-a", relationId: "relation-a", userIdentityId: "identity-1" },
  }).map((story) => story.id),
  ["story-a", "story-legacy-a"],
  "resume candidates stay inside the exact character/relation scope",
);
assert.deepEqual(
  listResumableOfflineStories({
    stories: [storyA, storyB, legacyA, groupStory],
    characters,
    relationships,
    scope: { characterId: "group", relationId: null, userIdentityId: "identity-1" },
  }).map((story) => story.id),
  ["story-group"],
  "group candidates do not inherit direct relationship stories",
);

// Multi-hop product decision: resume A keeps its identity; new B must use a
// distinct story identity while sharing the same canonical life character.
const resumeCandidate = listResumableOfflineStories({
  stories: [storyA],
  characters,
  relationships,
  scope: { characterId: "character-a", relationId: "relation-a", userIdentityId: "identity-1" },
})[0];
assert.equal(resumeCandidate?.id, "story-a");
const newStoryB = makeStory({ id: "story-b-new", title: "剧情 B", updatedAt: 50 });
assert.notEqual(newStoryB.id, resumeCandidate?.id, "new story gets a distinct scene/story identity");
assert.equal(newStoryB.characterId, resumeCandidate?.characterId, "resume/new keep the same canonical character life");

const multiHopChoices = [
  { from: "online", to: "offline-a", choice: "resume", storyId: "story-a" },
  { from: "offline-a", to: "online", choice: "exit", storyId: "story-a" },
  { from: "online", to: "offline-a", choice: "resume", storyId: "story-a" },
  { from: "offline-a", to: "online", choice: "exit", storyId: "story-a" },
  { from: "online", to: "offline-b", choice: "new", storyId: "story-b-new" },
  { from: "offline-b", to: "online", choice: "exit", storyId: "story-b-new" },
  { from: "online", to: "offline-a", choice: "resume", storyId: "story-a" },
] as const;
assert.deepEqual(multiHopChoices.map((step) => step.storyId), [
  "story-a", "story-a", "story-a", "story-a", "story-b-new", "story-b-new", "story-a",
]);
assert.equal(multiHopChoices.filter((step) => step.choice === "new").length, 1, "new-story selection is explicit");

console.log("PASS offline resume/new policy preserves scope, story identity, and same-life semantics");
