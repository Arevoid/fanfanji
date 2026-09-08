import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/settings/hooks/usePwaInstall.ts", import.meta.url), "utf8");
const appSettings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");

assert.match(hook, /pwa-install-prompt-available/);
assert.match(hook, /removeEventListener/);
assert.match(hook, /deferredPrompt/);
assert.match(hook, /display-mode: standalone/);
assert.match(appSettings, /usePwaInstall/);
assert.doesNotMatch(appSettings, /pwa-install-prompt-available/);

console.log("PASS PWA install and standalone lifecycle is isolated behind its hook");
