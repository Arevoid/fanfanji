import assert from "node:assert/strict";
import { createId } from "../src/core/id/createId";

const first = createId("message");
const second = createId("message");
assert.match(first, /^message-/);
assert.match(second, /^message-/);
assert.notEqual(first, second);

console.log("PASS centralized ID generation uses a stable prefix and collision-resistant entropy");
