import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadScheduleStore, saveScheduleStore } from "../src/core/storage/repositories/scheduleRepository";
import { EMPTY_SCHEDULE_STORE } from "../src/domain/schedule/scheduleTypes";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });

assert.equal(saveScheduleStore(EMPTY_SCHEDULE_STORE).success, true);
assert.deepEqual(loadScheduleStore().value, EMPTY_SCHEDULE_STORE);

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../src/components/AppStore.tsx", import.meta.url), "utf8");
const scheduleSource = readFileSync(new URL("../src/components/AppSchedule.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");

assert.match(appSource, /const loadAppSchedule = \(\) => import\("\.\/components\/AppSchedule"\)/);
assert.match(appSource, /activeApp === "schedule"/);
assert.match(appSource, /id: "schedule",\s+name: "日程"/);
assert.match(appSource, /seedFreshDesktopDefaults \|\| !FRESH_DESKTOP_DEFAULT_APP_IDS\.includes/, "new default apps are seeded only for untouched installs");
assert.match(storeSource, /id: "schedule",\s+name: "日程"/);
assert.match(scheduleSource, /暂时没有线下约定/);
assert.match(scheduleSource, /variant === "characterPhone"/);
assert.match(scheduleSource, /onCharacterPhoneScheduleAdd/);
assert.doesNotMatch(scheduleSource, /经期/);
assert.match(settingsSource, /"phone_schedule_v1"/);
assert.doesNotMatch(settingsSource, /"phone_calendar_events"/);

console.log("PASS schedule app foundation, store install path, versioned storage, and V1 empty UI");
