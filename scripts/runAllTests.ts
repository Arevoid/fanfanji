import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..");
const testFilePattern = /\.test\.(?:ts|tsx)$/;

function discoverTests(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(absolutePath);
    return entry.isFile() && testFilePattern.test(entry.name) ? [absolutePath] : [];
  });
}

const testFiles = discoverTests(scriptsDirectory).sort((a, b) => a.localeCompare(b));
if (testFiles.length === 0) {
  console.error("No test files were discovered under scripts/.");
  process.exit(1);
}

const startedAt = Date.now();
let passed = 0;
const failures: string[] = [];

for (const testFile of testFiles) {
  const relativePath = path.relative(projectRoot, testFile);
  const result = spawnSync(process.execPath, ["--import", "tsx", testFile], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.status === 0) {
    passed += 1;
    process.stdout.write(`PASS ${relativePath}\n`);
    continue;
  }

  failures.push(relativePath);
  process.stderr.write(`FAIL ${relativePath}\n`);
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) process.stderr.write(`${result.error.stack || result.error.message}\n`);
}

const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\nTest summary: ${passed}/${testFiles.length} passed in ${elapsedSeconds}s.`);
if (failures.length > 0) {
  console.error(`Failed tests:\n${failures.map((file) => `- ${file}`).join("\n")}`);
  process.exit(1);
}
