import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryCreationState.ts", import.meta.url), "utf8");
const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(hook, /showCreateModal/);
assert.match(hook, /selectedCharIds/);
assert.match(hook, /selectedCharacter\.memberIds/);
assert.match(hook, /useEffect/);
assert.match(appOffline, /useOfflineStoryCreationState/);
assert.doesNotMatch(appOffline, /const \[showCreateModal, setShowCreateModal\] = useState/);
assert.doesNotMatch(appOffline, /const \[newMode, setNewMode\] = useState/);

console.log("PASS offline story creation and edit form state is isolated behind its hook");
