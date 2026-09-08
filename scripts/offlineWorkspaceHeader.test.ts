import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../src/features/offline/components/OfflineWorkspaceHeader.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
assert.match(component, /onOpenReadingSettings/);
assert.match(component, /onOpenStorySettings/);
assert.match(component, /PopoverMenu/);
assert.match(app, /<OfflineWorkspaceHeader/);
assert.doesNotMatch(app, /workspaceMenuTriggerRef/);
console.log("PASS offline workspace header is separated from AppOffline orchestration");
