import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canPlaceHomeItems, getHomeItemDimensions } from "../src/features/home/homeGrid";

assert.deepEqual(getHomeItemDimensions("2x3"), { width: 3, height: 2 });
assert.equal(canPlaceHomeItems([], "2x3"), true);
assert.equal(canPlaceHomeItems([{ size: "2x4" }, { size: "2x4" }], "2x3"), false);
assert.equal(canPlaceHomeItems([{ size: "2x3" }, { size: "1x1" }, { size: "1x1" }], "2x4"), true);

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
assert.match(app, /item\.size === "2x3"[\s\S]{0,180}col-span-3[\s\S]{0,100}row-span-2/);
assert.match(app, /draggedItem\.size === "2x3"/);
assert.match(app, /findFirstAvailablePosition\(current, size, 0, homeGridRows\)/);
assert.match(app, /gridColumnStart: itemPosition\.column \+ 1/);
assert.match(app, /gridRowStart: itemPosition\.row \+ 1/);
console.log("dual music widget layout tests passed");
