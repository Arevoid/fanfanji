import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryRuntimeState.ts", import.meta.url), "utf8");
const persistenceHook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryPersistence.ts", import.meta.url), "utf8");
const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(hook, /storyPersistenceRef/);
assert.match(hook, /memorySyncInFlightRef/);
assert.match(hook, /workspaceEndRef/);
assert.match(persistenceHook, /storyPersistenceRef/);
assert.match(persistenceHook, /saveActiveStorySnapshot/);
assert.match(appOffline, /useOfflineStoryRuntimeState/);
assert.match(appOffline, /useOfflineStoryPersistence/);
assert.doesNotMatch(appOffline, /const saveActiveStorySnapshot = \(story: OfflineStory\)/);
assert.doesNotMatch(appOffline, /const \[inputText, setInputText\] = useState/);
assert.doesNotMatch(appOffline, /const memorySyncInFlightRef = useRef/);

console.log("PASS offline story editor runtime state is isolated behind its hook");
