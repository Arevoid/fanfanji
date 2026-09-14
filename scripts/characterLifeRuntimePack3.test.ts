import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyCharacterLifeStatePatch,
  createEmptyCharacterLifeState,
  normalizeCharacterLifeState,
} from "../src/domain/characterLife/lifeStateRuntime";
import {
  buildTemporalContext,
  classifyTemporalDistance,
  getLocalDayKey,
} from "../src/domain/characterLife/temporalRuntime";
import {
  createCharacterScheduleEntry,
  deriveScheduleStatus,
  normalizeCharacterScheduleStore,
  transitionCharacterSchedule,
} from "../src/domain/characterLife/scheduleRuntime";
import {
  createLifeEvent,
  deriveLifeEventStatus,
  lifeEventToCharacterEvent,
  transitionLifeEvent,
} from "../src/domain/characterLife/lifeEventRuntime";
import {
  createProactiveIntentRecord,
  evaluateProactiveEligibility,
  type ProactiveIntentRecord,
} from "../src/domain/characterLife/proactiveRuntime";
import { buildCharacterLifeProjection } from "../src/domain/characterLife/lifeProjection";
import { buildCrossAppContext } from "../src/domain/continuity/contextGateway";
import { createOpenLoop, listOpenLoops, transitionOpenLoop } from "../src/domain/continuity/openLoopRuntime";
import {
  loadCharacterLifeRuntimeStore,
  saveCharacterLifeState,
  saveProactiveIntentRecord,
} from "../src/core/storage/repositories/characterLifeRepository";
import { loadCharacterScheduleStore, saveCharacterScheduleEntry } from "../src/core/storage/repositories/characterScheduleRepository";

const scope = { relationId: "life-r1", characterId: "life-c1", userIdentityId: "life-u1" };
const otherScope = { relationId: "life-r2", characterId: "life-c2", userIdentityId: "life-u2" };
const day = new Date(2026, 8, 14, 10, 0, 0, 0).getTime();

const empty = createEmptyCharacterLifeState(scope, day);
assert.equal(empty.currentLifePhase, "unknown");
const patched = applyCharacterLifeStatePatch(empty, scope, {
  currentLifePhase: "morning",
  currentActivity: "commuting",
  availability: "busy",
  lastInteractionAt: day - 3 * 60 * 60 * 1000,
}, day);
assert.equal(patched.currentActivity, "commuting");
assert.equal(normalizeCharacterLifeState({ ...patched, relationId: "" }), undefined);
const isolatedState = applyCharacterLifeStatePatch(patched, otherScope, { currentActivity: "isolated" }, day);
assert.equal(isolatedState.relationId, otherScope.relationId);
assert.equal(isolatedState.currentActivity, "isolated");
assert.equal(patched.relationId, scope.relationId);

assert.equal(getLocalDayKey(day), "2026-09-14");
assert.equal(classifyTemporalDistance(day - 24 * 60 * 60 * 1000, day), "yesterday");
const temporal = buildTemporalContext({ now: day, lastInteractionAt: day - 2 * 60 * 60 * 1000, nextScheduleAt: day + 60 * 60 * 1000 });
assert.equal(temporal.interactedToday, true);
assert.equal(temporal.nextScheduleInMs, 60 * 60 * 1000);
assert.equal(temporal.scheduleOverdue, false);

const schedule = createCharacterScheduleEntry({
  ...scope,
  id: "schedule-routine",
  kind: "recurring_routine",
  title: "早晨通勤",
  startAt: day,
  recurrence: "daily",
  createdAt: day - 1,
  sourceEventRefs: ["event-routine"],
});
assert.ok(schedule);
assert.equal(deriveScheduleStatus(schedule!, day + 3 * 60 * 60 * 1000), "scheduled");
const postponed = transitionCharacterSchedule(schedule!, "postponed", day, day + day);
assert.equal(postponed?.status, "postponed");
assert.equal(normalizeCharacterScheduleStore({ schemaVersion: 1, entries: [schedule, { ...schedule, id: "broken", startAt: "bad" }] }).entries.length, 1);

const event = createLifeEvent({
  ...scope,
  id: "life-event-1",
  type: "offline_shared_event",
  summary: "一起吃饭",
  timestamp: day,
  interval: { startAt: day, endAt: day + 60 * 60 * 1000 },
  participants: [scope.characterId, scope.userIdentityId],
  source: "offline:story-1",
  visibility: "shared",
  status: "planned",
  refs: ["story-1"],
});
assert.ok(event);
assert.equal(deriveLifeEventStatus(event!, day + 2 * 60 * 60 * 1000), "missed");
assert.equal(lifeEventToCharacterEvent(event!).kind, "offline_shared_event");
assert.equal(transitionLifeEvent(event!, "ongoing", day + 10)?.status, "ongoing");

const loop = createOpenLoop({ id: "promise-1", scope, type: "promise", description: "晚上告诉你", createdAt: day, sourceRefs: ["event-1"] });
assert.ok(loop);
const pending = { ...loop!, status: "pending" as const };
assert.equal(listOpenLoops([pending], scope).length, 1);
assert.equal(transitionOpenLoop([pending], scope, pending.id, "fulfilled", day + 100)[0].status, "fulfilled");

const eligible = evaluateProactiveEligibility({
  enabled: true,
  scope,
  now: day + 8 * 60 * 60 * 1000,
  openLoops: [loop!],
  schedules: [schedule!],
});
assert.equal(eligible.eligible, true);
if (eligible.eligible) {
  const intent = createProactiveIntentRecord({ id: "intent-1", scope, intent: eligible, now: day + 8 * 60 * 60 * 1000 });
  assert.ok(intent);
  assert.equal(evaluateProactiveEligibility({ enabled: true, scope, now: day + 9 * 60 * 60 * 1000, openLoops: [loop!], recentIntents: [intent!] }).eligible, false);
}
assert.equal(evaluateProactiveEligibility({
  enabled: true,
  scope,
  now: day,
  lifeState: { ...patched, lastInteractionAt: day - 10 * 60 * 1000 },
}).reason, "quiet_period");

const projection = buildCharacterLifeProjection({
  app: "character_phone",
  scope,
  events: [lifeEventToCharacterEvent({ ...event!, status: "completed" })],
  schedules: [schedule!],
  openLoops: [loop!],
  now: day + 2 * 60 * 60 * 1000,
});
assert.equal(projection.scope.characterId, scope.characterId);
assert.equal(projection.scene, "online_chat");
assert.equal(projection.events.length, 1);
const gateway = buildCrossAppContext({ app: "diary", scope, lifeState: projection.state, temporal: projection.temporal, schedules: [schedule!], openLoops: [loop!] });
assert.equal(gateway.schedules.length, 1);
assert.equal(gateway.lifeState?.characterId, scope.characterId);
assert.equal(buildCrossAppContext({ app: "chat", scope, schedules: [{ ...schedule!, relationId: otherScope.relationId }] }).schedules.length, 0);

// Repository persistence uses the existing adapter and remains empty-safe in Node.
const storage = new Map<string, string>();
const localStorageStub: Storage = {
  get length() { return storage.size; },
  clear() { storage.clear(); },
  getItem(key) { return storage.get(key) ?? null; },
  key(index) { return [...storage.keys()][index] ?? null; },
  removeItem(key) { storage.delete(key); },
  setItem(key, value) { storage.set(key, value); },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: localStorageStub } });
assert.equal(saveCharacterLifeState(patched).success, true);
assert.equal(saveCharacterScheduleEntry(schedule!).success, true);
const storedIntent: ProactiveIntentRecord = {
  schemaVersion: 1,
  ...scope,
  id: "intent-storage",
  type: "find_user",
  status: "planned",
  reason: "test",
  sourceRefs: [],
  createdAt: day,
  cooldownUntil: day + 1000,
};
assert.equal(saveProactiveIntentRecord(storedIntent).success, true);
assert.equal(loadCharacterLifeRuntimeStore().value.states.length, 1);
assert.equal(loadCharacterScheduleStore().value.entries.length, 1);

const settingsSource = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(settingsSource, /phone_character_life_runtime_v1/);
assert.match(settingsSource, /phone_character_schedule_v1/);

console.log("PASS Character Life/Temporal/Schedule/Event/OpenLoop/Proactive runtime, persistence, privacy and backup compatibility");
