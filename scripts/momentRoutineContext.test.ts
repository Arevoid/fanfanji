import assert from "node:assert/strict";
import { buildMomentCognitiveContext } from "../src/features/moments/services/momentCognitiveContext";
import { buildMomentPromptContext, formatMomentPromptContext } from "../src/features/characterCognitive/promptAdapters/momentPromptAdapter";
import { buildCharacterRoutine } from "../src/domain/characterLife/characterRoutine/characterRoutineBuilder";
import { buildMomentPublicCognitiveContext } from "../src/domain/momentCognitive/momentPublicContextBuilder";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import type { Character } from "../src/types";

const character: Character = {
  id: "moment-routine-character",
  name: "Moment Routine Character",
  avatar: "avatar.png",
  personality: "calm",
  backstory: "keeps a regular schedule",
};
const relationship = createRelationship({
  id: "moment-routine-relation",
  characterId: character.id,
  userIdentityId: "moment-routine-identity",
  now: 1,
});

const buildContext = (occurredAt: number, routine?: ReturnType<typeof buildCharacterRoutine>) => buildMomentCognitiveContext({
  character,
  relationship,
  memories: [],
  events: [],
  occurredAt,
  routine,
});

const activeRoutine = buildCharacterRoutine({
  activeHours: [{ start: "09:00", end: "18:00" }],
  timezone: "UTC",
});
const activePrompt = formatMomentPromptContext(buildMomentPromptContext(
  buildContext(Date.UTC(2026, 0, 5, 12, 0), activeRoutine),
));
assert.match(activePrompt, /Current time period: afternoon/);
assert.match(activePrompt, /Current routine state: active/);

const sleepingRoutine = buildCharacterRoutine({
  sleepHours: [{ start: "23:00", end: "07:00" }],
  timezone: "UTC",
});
const sleepingPrompt = formatMomentPromptContext(buildMomentPromptContext(
  buildContext(Date.UTC(2026, 0, 5, 23, 30), sleepingRoutine),
));
assert.match(sleepingPrompt, /Current routine state: sleeping/);
assert.match(sleepingPrompt, /Prefer quiet, low-activity topics/);
assert.match(sleepingPrompt, /do not block generation/);

const crossMidnightRoutine = buildCharacterRoutine({
  activeHours: [{ start: "20:00", end: "02:00" }],
  sleepHours: [{ start: "02:00", end: "08:00" }],
  timezone: "UTC",
});
const crossMidnightContext = buildContext(Date.UTC(2026, 0, 6, 1, 30), crossMidnightRoutine);
assert.deepEqual(crossMidnightContext.routineContext, { period: "night", state: "active" });

const timezoneRoutine = buildCharacterRoutine({
  activeHours: [{ start: "08:00", end: "10:00" }],
  timezone: "Asia/Shanghai",
});
assert.deepEqual(
  buildContext(Date.UTC(2026, 0, 5, 1, 0), timezoneRoutine).routineContext,
  { period: "morning", state: "active" },
);

const legacyPrompt = formatMomentPromptContext(buildMomentPromptContext(buildContext(Date.UTC(2026, 0, 5, 12, 0))));
assert.doesNotMatch(legacyPrompt, /Routine context/);
assert.doesNotMatch(legacyPrompt, /activeHours|sleepHours|routineId|\"version\"/);

const publicContext = buildMomentPublicCognitiveContext({
  character,
  routine: sleepingRoutine,
  currentTime: { now: Date.UTC(2026, 0, 5, 23, 30) },
});
const publicPrompt = formatMomentPromptContext(buildMomentPromptContext(undefined, { publicContext }));
assert.match(publicPrompt, /Current routine state: sleeping/);
assert.doesNotMatch(publicPrompt, /activeHours|sleepHours|routineId/);

console.log("PASS Moment routine context projection, sleeping guidance, cross-midnight, timezone, and legacy compatibility");
