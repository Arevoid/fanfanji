import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const idSource = readFileSync(new URL("../src/core/id/createId.ts", import.meta.url), "utf8");
const chatController = readFileSync(new URL("../src/features/chat/controllers/chatController.ts", import.meta.url), "utf8");
const innerVoice = readFileSync(new URL("../src/features/chat/services/innerVoiceService.ts", import.meta.url), "utf8");
const diary = readFileSync(new URL("../src/domain/diary/diaryData.ts", import.meta.url), "utf8");

assert.match(idSource, /randomUUID/);
assert.match(idSource, /getRandomValues/);
assert.match(chatController, /createId\("user"\)/);
assert.match(innerVoice, /createId\("inner-voice"\)/);
assert.match(diary, /createId\(prefix\)/);

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const collectSourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? collectSourceFiles(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
});
for (const file of collectSourceFiles(sourceRoot)) {
  if (file.endsWith("core\\id\\createId.ts") || file.endsWith("core/id/createId.ts")) continue;
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(source, /crypto\.randomUUID/);
  assert.doesNotMatch(source, /Date\.now\(\).*Math\.random|Math\.random\(\).*Date\.now/);
}

console.log("PASS core record producers use centralized ID generation");
