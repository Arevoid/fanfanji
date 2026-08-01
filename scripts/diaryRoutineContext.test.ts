import assert from "node:assert/strict";
import { buildCharacterCognitiveContext } from "../src/domain/characterCognitive/contextBuilder";
import { buildCharacterRoutine } from "../src/domain/characterLife/characterRoutine/characterRoutineBuilder";
import { createDirectChatKnowledgeBoundary } from "../src/domain/characterCognitive/contextPolicy";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { buildDiaryPromptContext, formatDiaryPromptContext } from "../src/features/characterCognitive/promptAdapters/diaryPromptAdapter";
import type { Character } from "../src/types";

const character: Character = {
  id: "diary-routine-character",
  name: "Diary Routine Character",
  avatar: "avatar.png",
  personality: "thoughtful",
  backstory: "keeps notes about ordinary days",
};
const relationship = createRelationship({
  id: "diary-routine-relation",
  characterId: character.id,
  userIdentityId: "diary-routine-identity",
  now: 1,
});

const buildContext = (occurredAt: number, routine?: ReturnType<typeof buildCharacterRoutine>) => buildCharacterCognitiveContext({
  character,
  relation: relationship,
  memories: [],
  events: [],
  timeContext: { now: occurredAt, date: "2026-08-01", time: "17:00" },
  knowledgeBoundary: createDirectChatKnowledgeBoundary(),
  conversationId: relationship.conversationId,
  routine,
});

const workingRoutine = buildCharacterRoutine({
  workHours: [{ start: "09:00", end: "18:00" }],
  timezone: "UTC",
});
const workingContext = buildDiaryPromptContext(buildContext(Date.UTC(2026, 0, 5, 10, 0), workingRoutine));
assert.deepEqual(workingContext.routineContext, { period: "morning", state: "working" });
const workingPrompt = formatDiaryPromptContext(workingContext);
assert.match(workingPrompt, /Current time period: morning/);
assert.match(workingPrompt, /Current routine state: working/);

const crossMidnightRoutine = buildCharacterRoutine({
  sleepHours: [{ start: "22:00", end: "06:00" }],
  timezone: "UTC",
});
const crossMidnightContext = buildContext(Date.UTC(2026, 0, 6, 1, 0), crossMidnightRoutine);
assert.deepEqual(crossMidnightContext.routineContext, { period: "night", state: "sleeping" });

const legacyContext = buildDiaryPromptContext(buildContext(Date.UTC(2026, 0, 5, 10, 0)));
assert.equal(legacyContext.routineContext, undefined);
assert.doesNotMatch(formatDiaryPromptContext(legacyContext), /Routine context/);

const serialized = JSON.stringify(workingContext);
for (const forbidden of ["routineId", "activeHours", "sleepHours", "workHours", '"version"']) {
  assert.equal(serialized.includes(forbidden), false, `${forbidden} must not enter the Diary prompt context`);
}

console.log("PASS Diary routine context projection, working state, cross-midnight, and legacy compatibility");
