import { strict as assert } from "node:assert";
import type { Character, Message, UserSettings } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { createPostReplyCoordinator } from "../src/features/chat/controllers/postReplyCoordinator";

const message = { id: "message-1", characterId: "character-1", sender: "character", content: "reply", timestamp: 2 } as Message;
const character = { id: "character-1", name: "Character" } as Character;
const relationship = { id: "relation-1", characterId: "character-1", userIdentityId: "identity-1" } as CharacterRelationship;
const sideEffectInput = {
  userMsg: null,
  currentChatMessages: [],
  createdMessages: [message],
  activeCharacter: character,
  activeRelationship: relationship,
  relationships: [relationship],
  isOffline: false,
  activeOfflineStoryId: null,
};

let sideEffectCalls = 0;
let diaryCalls = 0;
const coordinator = createPostReplyCoordinator({
  runReplySideEffects: () => { sideEffectCalls += 1; },
  scheduleDiary: () => { diaryCalls += 1; },
});
const normal = coordinator.schedule({
  mode: "send",
  policy: "normal_send",
  sideEffects: sideEffectInput,
  diary: {
    relation: relationship,
    character,
    ownerIdentityId: "identity-1",
    messages: [message],
    settings: {} as UserSettings,
  },
});
assert.deepEqual(normal.scheduled, ["reply_side_effects", "diary"]);
assert.deepEqual(normal.failures, []);
assert.equal(sideEffectCalls, 1);
assert.equal(diaryCalls, 1);

let regenerateCalls = 0;
const regenerate = createPostReplyCoordinator({
  runReplySideEffects: () => { regenerateCalls += 1; },
  scheduleDiary: () => { regenerateCalls += 1; },
}).schedule({ mode: "regenerate", policy: "regenerate_none", sideEffects: sideEffectInput });
assert.deepEqual(regenerate.scheduled, []);
assert.deepEqual(regenerate.failures, []);
assert.equal(regenerateCalls, 0, "regenerate must keep its current no-post-reply policy");

const failure = createPostReplyCoordinator({
  runReplySideEffects: () => { throw new Error("side effect failure"); },
  scheduleDiary: () => { throw new Error("diary scheduling failure"); },
}).schedule({
  mode: "send",
  policy: "normal_send",
  sideEffects: sideEffectInput,
  diary: {
    relation: relationship,
    character,
    ownerIdentityId: "identity-1",
    messages: [message],
    settings: {} as UserSettings,
  },
});
assert.deepEqual(failure.scheduled, []);
assert.deepEqual(failure.failures, ["reply_side_effects", "diary"]);

console.log("Post-reply coordinator: 8 acceptance checks passed");
