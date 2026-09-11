import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  currentDevDiagnosticMode,
  installDevModuleTrace,
  installDevRuntimeProbe,
  isDevDiagnosticRuntime,
  registerDevModuleTrace,
} from "../src/core/runtime/devDiagnostics";

const root = globalThis as typeof globalThis & {
  __fanfanjiDevRuntimeProbe?: Record<string, unknown>;
  __fanfanjiDevModuleTrace?: {
    clear: () => void;
    count: () => number;
    get: () => unknown[];
    exportJson: () => string;
  };
};

assert.equal(isDevDiagnosticRuntime(), true);
assert.equal(currentDevDiagnosticMode(), "test");
installDevRuntimeProbe();
assert.deepEqual(root.__fanfanjiDevRuntimeProbe, {
  schemaVersion: "fanfanji-dev-runtime-probe-1",
  rootBundleLoaded: true,
  dev: false,
  mode: "test",
  hostClass: "unknown",
});

const trace = root.__fanfanjiDevModuleTrace;
assert.ok(trace);
trace.clear();
registerDevModuleTrace({
  stage: "root_module_evaluated",
  timestamp: 123,
  moduleName: "root",
  dev: true,
  mode: "test",
  reason: "current_bundle",
});
registerDevModuleTrace({
  stage: "collector_module_evaluated",
  timestamp: 124,
  moduleName: "collector",
  dev: true,
  mode: "test",
  instanceOrdinal: 7,
  reason: "module_loaded",
  message: "must not be retained",
  prompt: "must not be retained",
} as unknown as Parameters<typeof registerDevModuleTrace>[0]);
registerDevModuleTrace({
  stage: "not_a_stage",
  timestamp: 125,
  moduleName: "collector",
  dev: true,
  mode: "test",
} as unknown as Parameters<typeof registerDevModuleTrace>[0]);
assert.equal(trace.count(), 2);
assert.deepEqual(trace.get()[1], {
  stage: "collector_module_evaluated",
  timestamp: 124,
  moduleName: "collector",
  dev: true,
  mode: "test",
  instanceOrdinal: 7,
  reason: "module_loaded",
});

for (let index = 0; index < 70; index += 1) {
  registerDevModuleTrace({
    stage: "chat_module_evaluated",
    timestamp: index,
    moduleName: "chat",
    dev: true,
    mode: "test",
    reason: "module_loaded",
  });
}
assert.equal(trace.count(), 64);
const exported = trace.exportJson();
assert.doesNotMatch(exported, /must not be retained|prompt|response|authorization|apiKey|secret|token|requestId/i);

const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const diagnosticsSource = readFileSync(new URL("../src/core/runtime/devDiagnostics.ts", import.meta.url), "utf8");
assert.match(mainSource, /installDevRuntimeProbe\(\)/);
assert.match(diagnosticsSource, /if \(!isDevDiagnosticRuntime\(\)\) return/);
assert.match(diagnosticsSource, /MAX_TRACE_ENTRIES = 64/);

trace.clear();
delete root.__fanfanjiDevRuntimeProbe;
delete root.__fanfanjiDevModuleTrace;
console.log("PASS dev runtime diagnostics: bounded, dev/test-gated, and privacy-safe");
