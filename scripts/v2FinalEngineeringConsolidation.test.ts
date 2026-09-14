import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexedDB } from "fake-indexeddb";
import type { Message } from "../src/types";
import {
  buildSystemBackup,
  filterSystemBackupLocalStorageForRestore,
  parseSystemBackup,
} from "../src/features/settings/systemBackup";
import {
  createHandoffCapsule,
  isHandoffCapsule,
} from "../src/domain/continuity/handoffCapsule";
import { buildCrossAppContext } from "../src/domain/continuity/contextGateway";
import { createOpenLoop, type OpenLoopRecord } from "../src/domain/continuity/openLoopRuntime";
import { buildCharacterLifeProjection } from "../src/domain/characterLife/lifeProjection";
import {
  createLifeEvent,
  lifeEventToCharacterEvent,
} from "../src/domain/characterLife/lifeEventRuntime";
import {
  createCharacterScheduleEntry,
  deriveScheduleStatus,
} from "../src/domain/characterLife/scheduleRuntime";
import {
  evaluateProactiveEligibility,
} from "../src/domain/characterLife/proactiveRuntime";
import {
  loadCharacterLifeRuntimeStore,
  loadCharacterLifeState,
  loadProactiveIntentRecords,
} from "../src/core/storage/repositories/characterLifeRepository";
import {
  loadCharacterScheduleStore,
} from "../src/core/storage/repositories/characterScheduleRepository";
import { saveCharacterLifeState } from "../src/core/storage/repositories/characterLifeRepository";
import { saveCharacterScheduleEntry } from "../src/core/storage/repositories/characterScheduleRepository";
import { persistCharacterLifeInteraction, persistConfirmedLifeEvent, evaluateAndPersistProactiveIntent } from "../src/features/characterLife/services/characterLifeRuntimeService";
import { storageKeys } from "../src/core/storage/storageKeys";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
} as Storage;

Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });

const day = new Date(2026, 8, 14, 10, 0, 0, 0).getTime();
const scope = {
  relationId: "final-relation-a",
  characterId: "final-character-a",
  userIdentityId: "final-user-a",
  conversationId: "final-conversation-a",
};
const otherScope = {
  relationId: "final-relation-b",
  characterId: "final-character-b",
  userIdentityId: "final-user-b",
  conversationId: "final-conversation-b",
};

// Accepted direct-chat interaction updates only the durable life timestamp;
// it does not invoke an AI client or copy the message body into life state.
const interaction: Message = {
  id: "final-message-1",
  characterId: scope.characterId,
  relationId: scope.relationId,
  conversationId: scope.conversationId,
  sender: "user",
  content: "synthetic accepted chat input",
  timestamp: day + 60_000,
};
persistCharacterLifeInteraction(interaction, {
  isGroup: false,
  characterId: scope.characterId,
  relationId: scope.relationId,
  userIdentityId: scope.userIdentityId,
});
const interactionState = loadCharacterLifeState(scope, day);
assert.equal(interactionState.currentActivity, "chatting");
assert.equal(interactionState.lastInteractionAt, interaction.timestamp);
assert.equal(JSON.stringify(interactionState).includes(interaction.content), false);

const schedule = createCharacterScheduleEntry({
  ...scope,
  id: "final-schedule-1",
  kind: "one_off",
  title: "synthetic appointment",
  startAt: day - 60 * 60 * 1000,
  endAt: day - 30 * 60 * 1000,
  createdAt: day - 2 * 60 * 60 * 1000,
  sourceEventRefs: ["final-event-1"],
});
assert.ok(schedule);
assert.equal(saveCharacterScheduleEntry(schedule!).success, true);
assert.equal(deriveScheduleStatus(schedule!, day), "missed");
assert.equal(loadCharacterScheduleStore().value.entries[0].id, schedule!.id);

const promiseInput = {
  ...scope,
  id: "final-event-1",
  type: "promise_made",
  summary: "synthetic promise for a later follow-up",
  timestamp: day,
  source: "chat",
  visibility: "character_private" as const,
  status: "completed" as const,
  refs: ["final-loop-1"],
};
assert.equal(persistConfirmedLifeEvent(promiseInput), true);
const promise = createLifeEvent(promiseInput);
assert.ok(promise);
const promiseCharacterEvent = lifeEventToCharacterEvent(promise!);
assert.equal(promiseCharacterEvent.characterId, scope.characterId);

const openLoop = createOpenLoop({
  id: "final-loop-1",
  scope,
  type: "promise",
  description: promise!.summary,
  createdAt: day,
  sourceRefs: [promise!.id],
});
assert.ok(openLoop);
const projected = buildCharacterLifeProjection({
  app: "character_phone",
  scope,
  events: [promiseCharacterEvent],
  schedules: [schedule!],
  openLoops: [openLoop!],
  now: day,
});
assert.equal(projected.scene, "online_chat");
assert.equal(projected.scope.characterId, scope.characterId);
assert.equal(projected.events.length, 1);
assert.equal(projected.schedules.length, 1);
assert.equal(projected.openLoops.length, 1);

const kept = createLifeEvent({
  ...scope,
  id: "final-event-2",
  type: "promise_kept",
  summary: "synthetic promise fulfilled",
  timestamp: day + 2 * 60 * 60 * 1000,
  source: "chat",
  visibility: "character_private",
  status: "completed",
  refs: [openLoop!.id],
});
assert.ok(kept);
const continuityAfterKept = (await import("../src/domain/characterLife/lifeContinuityBridge")).projectLifeEventToContinuity({
  event: kept!,
  openLoops: [openLoop!],
  now: kept!.timestamp,
});
assert.equal(continuityAfterKept.openLoops[0].status, "fulfilled");
assert.ok(continuityAfterKept.emotion);
assert.equal(continuityAfterKept.beliefs.length, 1);

// Exact scope filters keep another character's private state out of the
// cross-app projection, including schedules and open loops.
const otherLoop: OpenLoopRecord = { ...openLoop!, id: "final-loop-other", scope: otherScope };
const gateway = buildCrossAppContext({
  app: "chat",
  scope,
  scene: "online_chat",
  lifeState: interactionState,
  schedules: [schedule!, { ...schedule!, id: "final-schedule-other", ...otherScope }],
  openLoops: [openLoop!, otherLoop],
});
assert.equal(gateway.visibility, "character_private");
assert.deepEqual(gateway.schedules.map((entry) => entry.id), [schedule!.id]);
assert.deepEqual(gateway.openLoops.map((entry) => entry.id), [openLoop!.id]);
assert.equal("diary" in gateway, false);

const capsule = createHandoffCapsule({
  id: "final-handoff-1",
  scope,
  previousScene: "offline_story",
  exitTimestamp: day + 3 * 60 * 60 * 1000,
  recentInteractionRefs: [interaction.id],
  lifeEventRefs: [promise!.id, kept!.id],
  scheduleRefs: [schedule!.id],
  openLoopRefs: [openLoop!.id],
});
assert.ok(capsule);
assert.equal(isHandoffCapsule(capsule), true);
assert.equal(capsule!.previousScene, "offline_story");
const resumedOnline = buildCharacterLifeProjection({ app: "chat", scope, now: day + 4 * 60 * 60 * 1000 });
assert.equal(resumedOnline.scene, "online_chat");

// Proactive eligibility is deterministic and bounded: quiet period blocks an
// immediate follow-up, then exactly one intent is persisted after it expires.
const quiet = evaluateProactiveEligibility({
  enabled: true,
  scope,
  now: interaction.timestamp + 1_000,
  lifeState: interactionState,
  openLoops: [openLoop!],
});
assert.equal(quiet.eligible, false);
assert.equal(quiet.reason, "quiet_period");
const eligibleAt = interaction.timestamp + 60 * 60 * 1000;
const persistedEligibility = evaluateAndPersistProactiveIntent({
  id: "final-intent-1",
  enabled: true,
  scope,
  now: eligibleAt,
  openLoops: [openLoop!],
});
assert.equal(persistedEligibility.eligible, true);
assert.equal(loadProactiveIntentRecords(scope).length, 1);
assert.equal(evaluateProactiveEligibility({
  enabled: true,
  scope,
  now: eligibleAt + 60 * 60 * 1000,
  openLoops: [openLoop!],
  recentIntents: loadProactiveIntentRecords(scope),
}).reason, "cooldown");
const duplicate = evaluateProactiveEligibility({
  enabled: true,
  scope,
  now: eligibleAt + 60 * 60 * 1000,
  openLoops: [openLoop!],
  recentIntents: loadProactiveIntentRecords(scope).map((intent) => ({ ...intent, cooldownUntil: eligibleAt - 1 })),
});
assert.equal(duplicate.reason, "duplicate_intent");

// The repository reload path is the restart boundary: persisted state and
// schedule records survive without a second copy or scope widening.
const reloadedLife = loadCharacterLifeRuntimeStore().value;
assert.equal(reloadedLife.states.filter((state) => state.relationId === scope.relationId).length, 1);
assert.equal(loadCharacterScheduleStore().value.entries.filter((entry) => entry.relationId === scope.relationId).length, 1);
assert.equal(loadCharacterLifeRuntimeStore().value.proactiveIntents.length, 1);
assert.equal(saveCharacterLifeState(interactionState).success, true);
assert.equal(loadCharacterLifeRuntimeStore().value.states.length, 1);

// Backup/export round trip covers the additive V2 stores while keeping the
// old flat format recoverable. Values are synthetic and contain no secrets.
values.set(storageKeys.settings, JSON.stringify({ themeMode: "synthetic" }));
values.set(storageKeys.continuityRuntime, JSON.stringify({ schemaVersion: 1, records: [] }));
values.set(storageKeys.characterLifeRuntime, JSON.stringify(reloadedLife));
values.set(storageKeys.characterSchedule, JSON.stringify(loadCharacterScheduleStore().value));
const backup = await buildSystemBackup(storage, [
  storageKeys.settings,
  storageKeys.continuityRuntime,
  storageKeys.characterLifeRuntime,
  storageKeys.characterSchedule,
]);
assert.equal(backup.format, "fanfanji-system-backup");
assert.equal(backup.version, 3);
assert.equal(typeof backup.checksum, "string");
assert.equal(backup.localStorage[storageKeys.characterLifeRuntime], JSON.stringify(reloadedLife));
assert.equal(backup.localStorage[storageKeys.characterSchedule], JSON.stringify(loadCharacterScheduleStore().value));
const parsed = parseSystemBackup(backup);
assert.equal(parsed.legacy, false);
assert.equal(parsed.integrityWarning, undefined);
for (const [key, value] of filterSystemBackupLocalStorageForRestore(Object.entries(parsed.localStorage), parsed.indexedDb)) {
  if (value !== null) values.set(key, value);
}
assert.equal(loadCharacterLifeRuntimeStore().value.states.length, 1);
assert.equal(loadCharacterScheduleStore().value.entries.length, 1);
const legacy = parseSystemBackup({
  phone_settings: JSON.stringify({ themeMode: "legacy" }),
  phone_characters_v3: JSON.stringify([{ id: "legacy-character", name: "Legacy", avatar: "", personality: "" }]),
});
assert.equal(legacy.legacy, true);
assert.equal(Object.hasOwn(legacy.indexedDb, "phone_character_life_runtime_v1"), false);

// New domain/runtime code is kept behind repository/service seams: no direct
// provider, browser-storage, or AI invocation is allowed in these files.
for (const path of [
  "../src/domain/characterLife/lifeStateRuntime.ts",
  "../src/domain/characterLife/temporalRuntime.ts",
  "../src/domain/characterLife/scheduleRuntime.ts",
  "../src/domain/characterLife/lifeEventRuntime.ts",
  "../src/domain/characterLife/lifeContinuityBridge.ts",
  "../src/domain/characterLife/proactiveRuntime.ts",
  "../src/domain/characterLife/lifeProjection.ts",
  "../src/features/characterLife/services/characterLifeRuntimeService.ts",
]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.equal(/\b(fetch|localStorage|indexedDB|apiKey|Authorization)\b/.test(source), false, path);
}

console.log("PASS V2 final consolidation synthetic full-life, scope isolation, handoff, proactive, reload, backup compatibility, and runtime-boundary audit");
