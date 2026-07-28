import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { HomeScreenItem } from "../src/types";
import {
  HOME_GRID_COLUMNS,
  HOME_GRID_ROWS,
  MAX_HOME_PAGES,
  buildOccupancy,
  canPlaceAt,
  findFirstAvailablePosition,
  getHighestOccupiedPage,
  getHomeGridPositionFromPoint,
  getItemSpan,
  getVisibleHomePageCount,
  migrateLegacyHomeScreenLayout,
  normalizeHomeScreenLayout,
  placeItemAt,
  swapOneByOneItems,
} from "../src/features/home/homeGrid";
import { sanitizeSystemBackupValue } from "../src/components/AppSettings";

const item = (
  id: string,
  size: HomeScreenItem["size"],
  page = 0,
  row?: number,
  column?: number,
): HomeScreenItem => ({
  id,
  type: size === "1x1" ? "app" : "widget",
  size,
  page,
  ...(row === undefined || column === undefined
    ? {}
    : { position: { page, row, column } }),
});

assert.equal(HOME_GRID_COLUMNS, 4);
assert.equal(HOME_GRID_ROWS, 4);
assert.deepEqual(getItemSpan("1x1"), { width: 1, height: 1 });
assert.deepEqual(getItemSpan("2x2"), { width: 2, height: 2 });
assert.deepEqual(getItemSpan("1x4"), { width: 4, height: 1 });
assert.deepEqual(getItemSpan("2x4"), { width: 4, height: 2 });
assert.deepEqual(getItemSpan("2x3"), { width: 3, height: 2 });

const fixed = [
  item("app-a", "1x1", 0, 0, 0),
  item("widget-a", "2x2", 0, 1, 1),
];
assert.equal(canPlaceAt(fixed, item("probe", "1x1"), { page: 0, row: 0, column: 3 }), true);
assert.equal(canPlaceAt(fixed, item("probe", "1x1"), { page: 0, row: 1, column: 1 }), false);
assert.equal(canPlaceAt([], item("wide", "2x3"), { page: 0, row: 0, column: 1 }), true);
assert.equal(canPlaceAt(fixed, item("wide", "2x3"), { page: 0, row: 0, column: 2 }), false);
assert.equal(canPlaceAt(fixed, item("bad", "1x1"), { page: 0, row: -1, column: 0 }), false);
assert.equal(canPlaceAt(fixed, item("bad", "1x1"), { page: Number.NaN, row: 0, column: 0 }), false);

const moved = placeItemAt(fixed, "app-a", { page: 0, row: 3, column: 3 });
assert.deepEqual(moved.find((entry) => entry.id === "app-a")?.position, { page: 0, row: 3, column: 3 });
assert.deepEqual(moved.find((entry) => entry.id === "widget-a")?.position, fixed[1].position);
const afterDelete = moved.filter((entry) => entry.id !== "widget-a");
assert.deepEqual(afterDelete[0].position, { page: 0, row: 3, column: 3 });
assert.deepEqual(
  placeItemAt(fixed, "app-a", { page: 0, row: 1, column: 1 }),
  fixed,
  "a colliding multi-cell target must be rejected without moving anything",
);
const crossPage = placeItemAt(fixed, "app-a", { page: 3, row: 2, column: 3 });
assert.deepEqual(crossPage.find((entry) => entry.id === "app-a")?.position, {
  page: 3,
  row: 2,
  column: 3,
});
assert.equal(crossPage.find((entry) => entry.id === "app-a")?.page, 3);
assert.deepEqual(fixed[0].position, { page: 0, row: 0, column: 0 }, "an uncommitted/cancelled drag leaves source data untouched");

const pair = [item("one", "1x1", 0, 0, 0), item("two", "1x1", 1, 3, 3)];
const swapped = swapOneByOneItems(pair, "one", "two");
assert.deepEqual(swapped[0].position, { page: 1, row: 3, column: 3 });
assert.equal(swapped[0].page, 1);
assert.deepEqual(swapped[1].position, { page: 0, row: 0, column: 0 });
assert.deepEqual(
  swapOneByOneItems([item("big", "2x2", 0, 0, 0), item("small", "1x1", 0, 3, 3)], "big", "small"),
  [item("big", "2x2", 0, 0, 0), item("small", "1x1", 0, 3, 3)],
);

const occupancy = buildOccupancy(fixed, 0);
assert.equal(occupancy[0][0], "app-a");
assert.equal(occupancy[1][1], "widget-a");
assert.equal(occupancy[2][2], "widget-a");

const fullPage = Array.from({ length: 16 }, (_, index) =>
  item(`full-${index}`, "1x1", 0, Math.floor(index / 4), index % 4));
assert.deepEqual(findFirstAvailablePosition(fullPage, "1x1", 0), { page: 1, row: 0, column: 0 });
const allPagesFull = Array.from({ length: MAX_HOME_PAGES * 16 }, (_, index) => {
  const page = Math.floor(index / 16);
  const cell = index % 16;
  return item(`limit-${index}`, "1x1", page, Math.floor(cell / 4), cell % 4);
});
assert.equal(findFirstAvailablePosition(allPagesFull, "1x1", 0), undefined);

const legacy = [
  item("legacy-wide", "2x3"),
  item("legacy-one", "1x1"),
  item("legacy-two", "1x1"),
  item("legacy-full", "2x4"),
];
const migrated = migrateLegacyHomeScreenLayout(legacy);
assert.deepEqual(migrated.map((entry) => entry.position), [
  { page: 0, row: 0, column: 0 },
  { page: 0, row: 0, column: 3 },
  { page: 0, row: 1, column: 3 },
  { page: 0, row: 2, column: 0 },
]);
assert.deepEqual(normalizeHomeScreenLayout(migrated), migrated, "migration must be idempotent");
assert.deepEqual(normalizeHomeScreenLayout([]), [], "an explicit empty layout stays empty");

const positionedAndBroken = normalizeHomeScreenLayout([
  item("keep", "1x1", 2, 2, 2),
  item("collision", "1x1", 2, 2, 2),
  { ...item("overflow", "2x3", 2), position: { page: 2, row: 3, column: 3 } },
  item("duplicate", "1x1", 0, 0, 0),
  item("duplicate", "1x1", 0, 0, 1),
]);
assert.deepEqual(positionedAndBroken.find((entry) => entry.id === "keep")?.position, { page: 2, row: 2, column: 2 });
assert.equal(positionedAndBroken.filter((entry) => entry.id === "duplicate").length, 1);
assert.ok(positionedAndBroken.every((entry) => entry.page === entry.position?.page));
assert.deepEqual(normalizeHomeScreenLayout(positionedAndBroken), positionedAndBroken);

assert.equal(getHighestOccupiedPage([item("later", "1x1", 5, 0, 0)]), 5);
assert.equal(getVisibleHomePageCount([item("later", "1x1", 5, 0, 0)], false), 6);
assert.equal(getVisibleHomePageCount([item("later", "1x1", 5, 0, 0)], true), 7);
assert.equal(getVisibleHomePageCount(allPagesFull, true), MAX_HOME_PAGES);
const beforeTailDrop = [item("first-page", "1x1", 0, 0, 0)];
assert.equal(getVisibleHomePageCount(beforeTailDrop, false), 1);
assert.equal(getVisibleHomePageCount(beforeTailDrop, true), 2, "editing exposes one temporary tail page");
const afterTailDrop = placeItemAt(beforeTailDrop, "first-page", { page: 1, row: 0, column: 0 });
assert.equal(getVisibleHomePageCount(afterTailDrop, false), 2, "placing an item makes the tail page formal");
assert.equal(getVisibleHomePageCount(afterTailDrop, true), 3, "a fresh temporary tail follows the new formal page");
assert.equal(getVisibleHomePageCount([], false), 1, "removing the final tail item safely trims trailing pages");
assert.equal(
  getHighestOccupiedPage([item("middle-page", "1x1", 2, 0, 0)]),
  2,
  "an empty middle page is not compacted",
);

const positionAtWidth = (containerWidth: number, column: number, row: number) => {
  const padding = 12;
  const gap = 16;
  const trackWidth = (containerWidth - padding * 2 - gap * 3) / 4;
  const rowHeight = 64;
  return getHomeGridPositionFromPoint({
    page: 0,
    pointerX: padding + column * (trackWidth + gap) + 5,
    pointerY: 14 + row * (rowHeight + gap) + 5,
    grabOffsetX: 5,
    grabOffsetY: 5,
    containerLeft: 0,
    containerTop: 0,
    containerWidth,
    paddingLeft: padding,
    paddingRight: padding,
    paddingTop: 14,
    columnGap: gap,
    rowGap: gap,
    rowHeight,
    size: "1x1",
  });
};
assert.deepEqual(positionAtWidth(319, 3, 3), { page: 0, row: 3, column: 3 });
assert.deepEqual(positionAtWidth(420, 3, 3), { page: 0, row: 3, column: 3 });

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
assert.match(appSource, /gridColumnStart:\s*itemPosition\.column \+ 1/);
assert.match(appSource, /gridRowStart:\s*itemPosition\.row \+ 1/);
assert.match(appSource, /setTimeout\(\(\) => \{[\s\S]*setCurrentPage\(targetPage\)[\s\S]*\}, 600\)/);
assert.match(appSource, /handleGlobalPointerCancel[\s\S]*finishDrag\(true\)/);
assert.match(appSource, /data-home-delete/);
assert.match(appSource, /onClickCapture=\{\(event\) => \{[\s\S]*isEditingHomeScreen/);
assert.match(appSource, /const raw = localStorage\.getItem\("phone_homescreen_items"\)/);
assert.match(appSource, /if \(raw !== null\)[\s\S]*Array\.isArray\(parsed\) \? parsed : \[\]/);

const restoredSystemLayout = JSON.parse(sanitizeSystemBackupValue(
  "phone_homescreen_items",
  JSON.stringify([
    item("system-backup-a", "1x1"),
    item("system-backup-b", "2x2"),
  ]),
) || "[]") as HomeScreenItem[];
assert.deepEqual(restoredSystemLayout.map((entry) => entry.position), [
  { page: 0, row: 0, column: 0 },
  { page: 0, row: 0, column: 1 },
]);
assert.deepEqual(
  JSON.parse(sanitizeSystemBackupValue("phone_homescreen_items", "[]") || "null"),
  [],
  "restoring an explicitly empty system backup must not seed defaults",
);

console.log("PASS fixed 4x4 home positions, migration, vacancies, swaps, limits, and responsive hit testing");
