import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const roots = ["src/App.tsx", "src/components"];
const directStorageAccess = /localStorage\.(?:getItem|setItem|removeItem|clear)\s*\(/;
const files: string[] = [];
for (const root of roots) {
  const visit = (relativePath: string) => {
    const absolutePath = path.resolve(relativePath);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(absolutePath)) visit(path.join(relativePath, entry));
    } else if (/\.(?:ts|tsx)$/.test(relativePath)) files.push(relativePath);
  };
  visit(root);
}

const offenders = files.filter((file) => directStorageAccess.test(readFileSync(file, "utf8")));
assert.deepEqual(offenders, [], `components must use the storage adapter instead of direct localStorage calls: ${offenders.join(", ")}`);
console.log("PASS component storage boundary forbids direct localStorage reads and writes");
