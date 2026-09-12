import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = mkdtempSync(path.join(os.tmpdir(), "fanfanji-production-"));

const forbiddenDevChunks = [
  "devRuntimeControls",
  "characterOwnershipBootstrapDev",
  "dedicatedRelationBootstrapDev",
  "portableDirectChatFixtureDev",
  "multiScopeFixtureDev",
];

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(absolute) : [absolute];
  });
}

try {
  // runAllTests launches each child with NODE_ENV=test; normalize the build
  // process so Vite folds the production DEV guard exactly as a release build.
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await viteBuild({
      root: projectRoot,
      mode: "production",
      build: { outDir: outputDirectory, emptyOutDir: false },
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  const files = collectFiles(outputDirectory);
  const generatedNames = files.map((file) => path.basename(file));
  for (const forbiddenChunk of forbiddenDevChunks) {
    assert.equal(
      generatedNames.some((name) => name.includes(forbiddenChunk)),
      false,
      `production build emitted a dedicated dev chunk: ${forbiddenChunk}`,
    );
  }

  const javascript = files
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.match(javascript, /DEV:!1/u, "production bundle must compile Vite DEV guards to false");

  // Installer modules retain their source-level names in shared chunks when
  // the production guard cannot be folded across an existing feature module.
  // The runtime contract is that every installer checks DEV before mutating
  // globalThis; this test pins that guard while the build check above proves
  // no standalone dev-control chunk can be loaded in production.
  const guardedSources = [
    "src/features/archives/characterOwnershipBootstrapDev.ts",
    "src/features/archives/dedicatedRelationBootstrapDev.ts",
    "src/features/archives/portableDirectChatFixtureDev.ts",
    "src/features/archives/multiScopeFixtureDev.ts",
    "src/features/chat/services/directChatMemoryLongEvidenceCollector.ts",
    "src/features/chat/services/directChatMemoryAdmissionShadowTelemetry.ts",
    "src/features/chat/services/directChatMemorySafetyVetoShadow.ts",
    "src/features/chat/services/directChatMemorySafetyVetoCanary.ts",
  ];
  for (const relative of guardedSources) {
    const source = readFileSync(path.join(projectRoot, relative), "utf8");
    assert.match(source, /if \(!isDev(?:Build|Runtime)\(\)|if \(!is[A-Za-z]+DevRuntime\(\)|if \(!isDev\) return/u, `${relative} must guard global installation`);
  }

  console.log("PASS production dev-tool absence: no standalone dev chunks, production DEV=false, installer guards pinned");
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
