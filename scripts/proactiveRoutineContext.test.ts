import assert from "node:assert/strict";
import { buildCharacterRoutine } from "../src/domain/characterLife/characterRoutine/characterRoutineBuilder";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import {
  buildProactiveCognitiveContext,
} from "../src/features/chat/services/proactiveCognitiveContext";
import {
  buildProactivePromptContext,
  formatProactivePromptContext,
} from "../src/features/characterCognitive/promptAdapters/proactivePromptAdapter";
import type { Character } from "../src/types";

const character: Character = {
  id: "routine-character",
  name: "Routine Character",
  avatar: "avatar.png",
  personality: "steady",
  backstory: "keeps a regular schedule",
};
const relationship = createRelationship({
  id: "routine-relation",
  characterId: character.id,
  userIdentityId: "routine-identity",
  now: 1,
});

const buildContext = (occurredAt: number, routine?: ReturnType<typeof buildCharacterRoutine>) => buildProactiveCognitiveContext({
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
const activeContext = buildContext(Date.UTC(2026, 0, 5, 12, 0), activeRoutine);
assert.deepEqual(activeContext?.routineContext, { period: "afternoon", state: "active" });
const activePromptContext = activeContext ? buildProactivePromptContext(activeContext) : undefined;
assert.deepEqual(activePromptContext?.routineContext, { period: "afternoon", state: "active" });

const sleepingRoutine = buildCharacterRoutine({
  sleepHours: [{ start: "23:00", end: "07:00" }],
  timezone: "UTC",
});
const sleepingContext = buildContext(Date.UTC(2026, 0, 5, 23, 30), sleepingRoutine);
assert.deepEqual(sleepingContext?.routineContext, { period: "night", state: "sleeping" });
const sleepingPrompt = sleepingContext ? formatProactivePromptContext(buildProactivePromptContext(sleepingContext)) : "";
assert.match(sleepingPrompt, /Current routine state: sleeping/);
assert.match(sleepingPrompt, /behavior reference only/);

const disabledContext = buildProactiveCognitiveContext({
  character,
  relationship,
  memories: [],
  events: [],
  occurredAt: Date.UTC(2026, 0, 5, 23, 30),
  routine: sleepingRoutine,
  timeAwareness: false,
});
assert.equal(disabledContext?.routineContext, undefined, "disabled time awareness must not project routine state");
const disabledPrompt = disabledContext ? formatProactivePromptContext(buildProactivePromptContext(disabledContext)) : "";
assert.doesNotMatch(disabledPrompt, /Time context:|Current routine state:|sleeping/);

const crossMidnightRoutine = buildCharacterRoutine({
  activeHours: [{ start: "20:00", end: "02:00" }],
  sleepHours: [{ start: "02:00", end: "08:00" }],
  timezone: "UTC",
});
assert.deepEqual(
  buildContext(Date.UTC(2026, 0, 6, 1, 30), crossMidnightRoutine)?.routineContext,
  { period: "night", state: "active" },
);
assert.deepEqual(
  buildContext(Date.UTC(2026, 0, 6, 3, 0), crossMidnightRoutine)?.routineContext,
  { period: "night", state: "sleeping" },
);

const timezoneInstant = Date.UTC(2026, 0, 5, 1, 0);
const shanghaiRoutine = buildCharacterRoutine({
  activeHours: [{ start: "08:00", end: "10:00" }],
  timezone: "Asia/Shanghai",
});
const losAngelesRoutine = buildCharacterRoutine({
  activeHours: [{ start: "16:00", end: "18:00" }],
  timezone: "America/Los_Angeles",
});
assert.deepEqual(buildContext(timezoneInstant, shanghaiRoutine)?.routineContext, { period: "morning", state: "active" });
assert.deepEqual(buildContext(timezoneInstant, losAngelesRoutine)?.routineContext, { period: "evening", state: "active" });

const legacyContext = buildContext(Date.UTC(2026, 0, 5, 23, 30));
assert.equal(legacyContext?.routineContext, undefined, "no routine preserves the legacy cognitive context");
const legacyPrompt = legacyContext ? buildProactivePromptContext(legacyContext) : undefined;
assert.equal(legacyPrompt?.routineContext, undefined, "no routine preserves the legacy proactive projection");

const scheduledTime = relationship.scheduledProactiveTime;
buildContext(Date.UTC(2026, 0, 5, 12, 0), activeRoutine);
assert.equal(relationship.scheduledProactiveTime, scheduledTime, "routine projection does not modify scheduling state");

const serialized = JSON.stringify(activePromptContext);
for (const forbidden of ["routineId", '"version"', "activeHours", "sleepHours", "workHours"]) {
  assert.equal(serialized.includes(forbidden), false, `${forbidden} must not enter proactive prompt context`);
}

console.log("PASS proactive routine context, timezone, cross-midnight, compatibility, and scheduler isolation");
