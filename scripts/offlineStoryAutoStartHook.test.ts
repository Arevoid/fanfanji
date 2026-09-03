import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const hook = readFileSync("src/features/offline/hooks/useOfflineStoryAutoStart.ts", "utf8");
const page = readFileSync("src/components/AppOffline.tsx", "utf8");

assert.match(hook, /autoStartFirstAct/);
assert.match(hook, /isImportedContext/);
assert.match(hook, /saveActiveStorySnapshot/);
assert.match(hook, /handleSendMessage\(undefined, true\)/);
assert.match(page, /useOfflineStoryAutoStart/);
assert.doesNotMatch(page, /preparedStory = \{\.\.\.story/);

console.log("PASS offline first-act auto-start is isolated and consumes its marker before generation");
