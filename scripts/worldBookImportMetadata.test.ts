import assert from "node:assert/strict";
import { mapSillyTavernEntry } from "../src/utils/pngParser";
import { normalizeImportedWorldBookPosition } from "../src/domain/worldbook/worldBookPosition";

const imported = mapSillyTavernEntry({
  comment: "关系设定",
  content: "仅对这段关系生效",
  keys: ["约定"],
  vector: true,
  insertion_order: "7",
  position: "at_depth",
  characterIds: ["char-a", "char-b", "char-a"],
  visibility: "private",
  purpose: "relationship_context",
}, "global");

assert.equal(imported.triggerType, "vector");
assert.equal(imported.depth, 7);
assert.equal(imported.position, "at_depth");
assert.deepEqual(imported.characterIds, ["char-a", "char-b"]);
assert.deepEqual(imported.scope, { kind: "characters", characterIds: ["char-a", "char-b"] });
assert.equal(imported.visibility, "private");
assert.equal(imported.purpose, "relationship_context");
assert.equal(normalizeImportedWorldBookPosition("before_chat_history"), "before_chat_history");

console.log("PASS WorldBook imports preserve vector, scope, visibility, purpose, and string depth metadata");
