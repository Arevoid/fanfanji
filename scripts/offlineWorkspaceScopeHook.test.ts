import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineWorkspaceScope.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
assert.match(hook, /resolveOfflineRelationChoices/);
assert.match(hook, /getOfflineGroupStoryStorageKey/);
assert.match(hook, /canAccessOfflineStoryFromCurrentRelation/);
assert.match(hook, /onOpenOfflineStoryHandled/);
assert.match(app, /useOfflineWorkspaceScope/);
assert.doesNotMatch(app, /const lastLoadedStoryScope/);
console.log("PASS offline workspace relation selection and story restoration are isolated in a hook");
