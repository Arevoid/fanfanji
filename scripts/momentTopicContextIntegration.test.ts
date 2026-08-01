import assert from "node:assert/strict";
import { buildMomentPublicCognitiveContext } from "../src/domain/momentCognitive/momentPublicContextBuilder";
import { createMomentTopicRecord } from "../src/domain/moments/momentGeneration/momentTopicHistory";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { buildMomentCognitiveContext } from "../src/features/moments/services/momentCognitiveContext";
import {
  buildMomentPromptContext,
  formatMomentPromptContext,
} from "../src/features/characterCognitive/promptAdapters/momentPromptAdapter";
import type { Character } from "../src/types";

const characterA: Character = {
  id: "moment-topic-character-a",
  name: "Topic Character A",
  avatar: "a.png",
  personality: "calm",
  backstory: "public topic history A",
};
const characterB: Character = {
  id: "moment-topic-character-b",
  name: "Topic Character B",
  avatar: "b.png",
  personality: "bright",
  backstory: "public topic history B",
};
const relation = createRelationship({
  id: "moment-topic-relation",
  characterId: characterA.id,
  userIdentityId: "moment-topic-identity",
  now: 1,
});

const makeTopic = (characterId: string, topic: string, generatedAt: number, momentId: string) => createMomentTopicRecord({
  characterId,
  topic,
  category: "daily_life",
  generatedAt,
  momentId,
});

const topicHistory = [
  makeTopic(characterA.id, "weekend-gallery", 9_999, "moment-a-1"),
  makeTopic(characterA.id, "weekend-gallery", 9_998, "moment-a-2"),
  makeTopic(characterA.id, "morning-coffee", 9_997, "moment-a-3"),
  makeTopic(characterB.id, "identity-b-topic", 9_999, "moment-b-1"),
].filter((topic) => topic !== undefined);

const context = buildMomentPublicCognitiveContext({
  character: characterA,
  topicHistory,
  currentTime: { now: 10_000, date: "2026-08-01", time: "20:00" },
});
assert.deepEqual(context.topicContext?.recentTopics, ["weekend-gallery", "morning-coffee"]);
assert.deepEqual(context.topicContext?.repeatedTopics, ["weekend-gallery"]);
assert.deepEqual(context.topicContext?.cooldownTopics, ["weekend-gallery", "morning-coffee"]);
assert.equal(context.topicContext?.recentTopics.includes("identity-b-topic"), false);

const promptContext = buildMomentPromptContext(
  buildMomentCognitiveContext({
    character: characterA,
    relationship: relation,
    memories: [],
    events: [],
    occurredAt: 10_000,
  }),
  { publicContext: context },
);
const prompt = formatMomentPromptContext(promptContext);
assert.match(prompt, /Topic diversity guidance/);
assert.match(prompt, /weekend-gallery/);
assert.match(prompt, /morning-coffee/);
assert.match(prompt, /hints only; not facts or hard bans/);

for (const forbidden of [
  characterA.id,
  characterB.id,
  "moment-a-1",
  "moment-a-2",
  "moment-b-1",
  relation.id,
  relation.userIdentityId,
  "identity-b-topic",
]) {
  assert.equal(prompt.includes(forbidden), false, `${forbidden} must not enter the Moment prompt`);
}

const emptyContext = buildMomentPublicCognitiveContext({
  character: characterA,
  currentTime: { now: 10_000 },
});
assert.equal(emptyContext.topicContext, undefined);
const legacyPrompt = formatMomentPromptContext(buildMomentPromptContext(buildMomentCognitiveContext({
  character: characterA,
  relationship: relation,
  memories: [],
  events: [],
  occurredAt: 10_000,
})));
assert.doesNotMatch(legacyPrompt, /Topic diversity guidance/);

console.log("PASS Moment topic history flows through public cognitive context and prompt adapter without exposing internal fields");
