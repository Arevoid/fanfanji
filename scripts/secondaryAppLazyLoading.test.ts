import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

for (const component of ["AppWorldBook", "AppForum", "AppSettings", "AppOffline"]) {
  assert.match(appSource, new RegExp(`const ${component} = React\\.lazy`));
  assert.doesNotMatch(appSource, new RegExp(`import ${component} from`));
}
assert.match(appSource, /function LazyAppBoundary/);
assert.match(appSource, /<React\.Suspense/);
assert.match(appSource, /import AppChat from "\.\/components\/AppChat"/);

console.log("secondary app lazy-loading tests passed");
