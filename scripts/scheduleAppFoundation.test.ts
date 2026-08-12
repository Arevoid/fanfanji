import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadScheduleStore, saveScheduleStore } from "../src/core/storage/repositories/scheduleRepository";
import { EMPTY_SCHEDULE_STORE, SCHEDULE_SCHEMA_VERSION, type ScheduleStore } from "../src/domain/schedule/scheduleTypes";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });

assert.equal(saveScheduleStore(EMPTY_SCHEDULE_STORE).success, true);
assert.deepEqual(loadScheduleStore().value, EMPTY_SCHEDULE_STORE);

const scopedStore: ScheduleStore = {
  schemaVersion: SCHEDULE_SCHEMA_VERSION,
  entries: [{
    id: "appointment-a",
    schemaVersion: SCHEDULE_SCHEMA_VERSION,
    category: "appointment",
    title: "与角色见面",
    status: "confirmed",
    dateKey: "2026-08-16",
    relationId: "relation-a",
    characterId: "character-a",
    userIdentityId: "identity-a",
    createdAt: 1,
    updatedAt: 1,
  }],
};
assert.equal(saveScheduleStore(scopedStore).success, true);
assert.deepEqual(loadScheduleStore().value, scopedStore);

const invalidStore = {
  ...scopedStore,
  entries: [{ ...scopedStore.entries[0], relationId: "" }],
} as ScheduleStore;
assert.equal(saveScheduleStore(invalidStore).success, false, "unscoped entries must not be persisted");

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../src/components/AppStore.tsx", import.meta.url), "utf8");
const scheduleSource = readFileSync(new URL("../src/components/AppSchedule.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");

assert.match(appSource, /const loadAppSchedule = \(\) => import\("\.\/components\/AppSchedule"\)/);
assert.match(appSource, /activeApp === "schedule"/);
assert.match(appSource, /id: "schedule",\s+name: "日程"/);
assert.doesNotMatch(appSource, /item\.id !== "schedule"|id !== "schedule"/);
assert.match(storeSource, /id: "schedule",\s+name: "日程"/);
assert.match(scheduleSource, /暂时没有线下约定/);
assert.doesNotMatch(scheduleSource, /添加日程|经期|待办/);
assert.match(settingsSource, /"phone_schedule_v1"/);
assert.doesNotMatch(settingsSource, /"phone_calendar_events"/);

console.log("PASS schedule app foundation, store install path, scoped storage, and V1 empty UI");
