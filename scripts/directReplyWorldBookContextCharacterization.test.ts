import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PromptComposer } from "../src/domain/prompt/PromptComposer";
import { formatStructuralWorldBookSection } from "../src/features/chat/prompts/chatWorldBookPromptSections";
import { collectOfflineWorldBookContext } from "../src/features/offline/prompts/offlineWorldBookContext";
import { buildWorldBookSystemBlocks, getLatestWorldBookEntries } from "../src/utils/worldBook";
import type { Character, WorldBookEntry } from "../src/types";

const entry = (id: string, overrides: Partial<WorldBookEntry> = {}): WorldBookEntry => ({
  id,
  title: `标题-${id}`,
  category: "characterization",
  content: `内容-${id}`,
  timestamp: 1,
  characterId: "char-a",
  triggerType: "keys",
  keywords: id,
  isActive: true,
  ...overrides,
});

const chatScope = {
  scenario: "chat" as const,
  characterId: "char-a",
  userIdentityId: "identity-a",
  relationId: "relation-a",
};

// Trigger policy: persona rules and constants are unconditional; key/vector
// entries depend on the prepared scan text; inactive entries never enter the
// direct-chat projection.
const triggerBlocks = buildWorldBookSystemBlocks([
  entry("constant", { characterId: "global", triggerType: "constant", depth: 4 }),
  entry("persona", { purpose: "persona_rule", keywords: "never-mentioned", depth: 3 }),
  entry("keys-hit", { keywords: "blue", depth: 2 }),
  entry("keys-miss", { keywords: "orange", depth: 1 }),
  entry("vector-hit", { triggerType: "vector", keywords: "unrelated", content: "blue orchard", depth: 5 }),
  entry("inactive", { triggerType: "constant", isActive: false, depth: 0 }),
], "char-a", "blue", chatScope);
assert.deepEqual(triggerBlocks.allTriggered.map((item) => item.id), ["keys-hit", "persona", "constant", "vector-hit"]);
assert.equal(triggerBlocks.formattedAll.includes("内容-keys-miss"), false);
assert.equal(triggerBlocks.formattedAll.includes("内容-inactive"), false);

// Scope policy is characterized independently from trigger matching. Chat can
// see matching identity/relation records; group cannot see private identity or
// relationship records, and public reads require explicit public opt-in.
const scopedEntries = [
  entry("global", { characterId: "global", triggerType: "constant" }),
  entry("other-character", { characterId: "char-b", triggerType: "constant" }),
  entry("identity", { characterId: undefined, scope: { kind: "identity", userIdentityId: "identity-a" }, triggerType: "constant" }),
  entry("relation", { characterId: undefined, scope: { kind: "relationship", relationId: "relation-a", characterId: "char-a", userIdentityId: "identity-a" }, triggerType: "constant" }),
  entry("public", { characterId: "global", visibility: "public", purpose: "world_canon", triggerType: "constant" }),
];
assert.deepEqual(
  buildWorldBookSystemBlocks(scopedEntries, "char-a", "", chatScope).allTriggered.map((item) => item.id),
  ["global", "identity", "relation", "public"],
);
assert.deepEqual(
  buildWorldBookSystemBlocks(scopedEntries, "char-a", "", { scenario: "group", characterId: "char-a", userIdentityId: "identity-a", relationId: "relation-a" }).allTriggered.map((item) => item.id),
  ["global", "public"],
);
assert.deepEqual(
  buildWorldBookSystemBlocks(scopedEntries, "char-a", "", { scenario: "public", characterId: "char-a" }).allTriggered.map((item) => item.id),
  ["public"],
);

// Placement policy: triggered entries are depth ordered (stable for equal
// depths), structural positions remain separate, and at_depth is represented
// once as a history injection rather than duplicated in formattedAll.
const placementEntries = [
  entry("equal-first", { triggerType: "constant", depth: 2, position: "before_char_def" }),
  entry("depth", { triggerType: "constant", depth: 1, position: "at_depth" }),
  entry("equal-second", { triggerType: "constant", depth: 2, position: "after_char_def" }),
  entry("history", { triggerType: "constant", depth: 3, position: "before_chat_history" }),
];
const placementBlocks = buildWorldBookSystemBlocks(placementEntries, "char-a", "", chatScope);
assert.deepEqual(placementBlocks.allTriggered.map((item) => item.id), ["depth", "equal-first", "equal-second", "history"]);
assert.deepEqual(placementBlocks.at_depth.map((item) => ({ sourceId: item.sourceId, depth: item.depth })), [{ sourceId: "world-book:depth", depth: 1 }]);
assert.equal(placementBlocks.formattedAll.includes("内容-depth"), false);
assert.equal(formatStructuralWorldBookSection(placementBlocks, "before_char_def").includes("内容-equal-first"), true);
assert.equal(formatStructuralWorldBookSection(placementBlocks, "before_chat_history").includes("内容-history"), true);
const composed = PromptComposer.compose({
  scenario: "direct-chat",
  message: "当前消息",
  history: [{ role: "user", text: "历史" }],
  systemInstruction: formatStructuralWorldBookSection(placementBlocks, "before_char_def"),
  historyInjections: placementBlocks.at_depth,
});
assert.equal(composed.history.some((item) => item.text.includes("内容-depth")), true);
assert.equal(composed.systemInstruction.includes("内容-equal-first"), true);

// Normal send and regenerate intentionally prepare different scan/history
// boundaries, but use the same WorldBook selection, scope, projection and
// injection seam. Equal inputs therefore remain exactly equivalent.
const normalScan = ["当前消息", "最近消息一", "最近消息二"].join("\n");
const regenerateScan = ["当前消息", "最近消息一", "最近消息二"].join("\n");
assert.deepEqual(
  buildWorldBookSystemBlocks(placementEntries, "char-a", normalScan, chatScope),
  buildWorldBookSystemBlocks(placementEntries, "char-a", regenerateScan, chatScope),
);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appChatSource = readFileSync(path.join(projectRoot, "src/components/AppChat.tsx"), "utf8");
const regenerateSource = readFileSync(path.join(projectRoot, "src/features/chat/hooks/useChatRegenerationAction.ts"), "utf8");
for (const source of [appChatSource, regenerateSource]) {
  assert.match(source, /buildWorldBookSystemBlocks\(worldBookEntries \|\| \[\]/);
  assert.match(source, /formatStructuralWorldBookSection\(wbBlocks/);
  assert.match(source, /historyInjections: wbBlocks\.at_depth/);
  assert.match(source, /scenario: "chat"/);
  assert.match(source, /slice\(-10\)/);
}

// The WorldBook utility performs no provider request. Storage freshness is a
// read-only best-effort fallback; with no browser storage the caller's input
// remains the source of truth and no persistence is attempted.
assert.deepEqual(getLatestWorldBookEntries(placementEntries), placementEntries);
const worldBookSource = readFileSync(path.join(projectRoot, "src/utils/worldBook.ts"), "utf8");
assert.doesNotMatch(worldBookSource, /\b(apiChat|requestDirectChatTurn|fetch\s*\()/);

// Offline consumes an explicitly supplied snapshot. The context collector
// only projects matching entries and depth injections; it does not refresh or
// mutate the snapshot in this boundary.
const offlineSnapshot = [entry("offline-key", { triggerType: "keys", keywords: "offline" })];
const offlineContext = collectOfflineWorldBookContext({
  entries: offlineSnapshot,
  characters: [{ id: "char-a" } as Character],
  scanText: "offline",
});
assert.deepEqual([...offlineContext.triggeredEntries.keys()], ["offline-key"]);
assert.equal(offlineContext.depthInjections.size, 0);

console.log("PASS direct WorldBook context characterization: trigger, scope, placement, normal/regenerate seam, offline snapshot, and no-provider checks");
