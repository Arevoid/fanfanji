import assert from "node:assert/strict";
import fs from "node:fs";

const settings = fs.readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = fs.readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const storageKeys = fs.readFileSync(new URL("../src/core/storage/storageKeys.ts", import.meta.url), "utf8");

for (const key of [
  "phone_character_knowledge_claims",
  "phone_conversation_summaries",
  "phone_behavior_corrections",
  "phone_character_knowledge_migration_state",
  "phone_moment_topic_history",
  "phone_proactive_topic_history",
]) {
  assert.match(settings, new RegExp(`"${key}"`), `${key} must round-trip through system backup`);
  assert.match(storageKeys, new RegExp(`"${key}"`), `${key} must have a canonical storage key`);
}
assert.match(app, /removeCharacterTruthForRelations\(relationIds\)/, "character deletion must clear truth records");
assert.match(chat, /removeCharacterTruthForRelations\(\[relationId\]\)/, "relationship deletion must clear truth records");
assert.match(app, /retractBySourceMessageIds\(\[id\], sourceScope\)/, "message deletion must retract source-linked claims");
assert.match(app, /removeMomentTopicsForMoments\(\[momentId\]\)/, "Moment deletion must clear topic history");

console.log("PASS Character Truth backup and relationship cleanup wiring coverage");
