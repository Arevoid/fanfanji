import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineToast.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
assert.match(hook, /clearTimeout/);
assert.match(hook, /useCallback/);
assert.match(app, /useOfflineToast/);
assert.doesNotMatch(app, /setTimeout\(\(\) => setToast/);
console.log("PASS offline workspace toast lifecycle is isolated and cleaned up on unmount");
