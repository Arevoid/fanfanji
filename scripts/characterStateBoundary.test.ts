import assert from "node:assert/strict";
import {
  DEFAULT_ONLINE_CHARACTER_STATE,
  canTransitionRelationship,
  isSharedPhysicalScene,
} from "../src/domain/character/characterState";

assert.equal(DEFAULT_ONLINE_CHARACTER_STATE.scene, "online_chat");
assert.equal(DEFAULT_ONLINE_CHARACTER_STATE.relationship, "unknown");
assert.equal(canTransitionRelationship("friend", "partner", false), false);
assert.equal(canTransitionRelationship("friend", "partner", true), true);
assert.equal(canTransitionRelationship("friend", "friend", false), true);
assert.equal(isSharedPhysicalScene("online_chat"), false);
assert.equal(isSharedPhysicalScene("memory_recall"), false);
assert.equal(isSharedPhysicalScene("offline_story"), true);
assert.equal(isSharedPhysicalScene("imagined_scene"), true);

console.log("PASS character relationship, scene, event, and memory boundary vocabulary");
