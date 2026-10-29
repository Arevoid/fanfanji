import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

// Execute the production hook with deterministic hook slots and deferred
// requests. No browser profile, persistence, network or paid model is used.
const slots: any[] = [];
let cursor = 0;
const react = {
  useState(initial: unknown) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value: any) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  },
  useRef(initial: unknown) {
    const index = cursor++;
    return slots[index] ||= { current: initial };
  },
  useEffect(effect: () => void, deps: unknown[]) {
    const index = cursor++;
    if (!slots[index] || deps.some((dep, i) => dep !== slots[index][i])) {
      slots[index] = deps;
      effect();
    }
  },
};
const bundled = await build({
  entryPoints: [fileURLToPath(new URL("../src/features/chat/hooks/useChatController.ts", import.meta.url))],
  bundle: true, platform: "node", format: "cjs", write: false, external: ["react"],
});
const exports: any = {};
const module = { exports };
runInNewContext(bundled.outputFiles[0].text, {
  module, exports, require: (name: string) => { assert.equal(name, "react"); return react; },
  AbortController, console, setTimeout, clearTimeout,
});
const pending: { signal: AbortSignal; complete: () => void }[] = [];
const base = {
  currentChatMessages: [], onSendMessage: () => {}, offlineStories: [],
  generateAndSendCharacterImage: async () => false,
  isOfflineModeActive: false, isInputNarration: false, activeOfflineStoryId: null,
  generateResponseForUserMessage: (_message: unknown, _history: unknown, signal: AbortSignal) =>
    new Promise<void>(complete => pending.push({ signal, complete })),
};
function render(character: string) {
  const options = { ...base, activeChatCharId: character, activeCharacter: { id: character },
    runtimeContext: { characterId: character, userIdentityId: "test-identity", relationId: `r-${character}`, conversationId: `c-${character}`, isGroup: false } };
  cursor = 0;
  module.exports.useChatController(options); // flush scope effect
  cursor = 0;
  return module.exports.useChatController(options);
}
const firstA = render("A").handleSendAndReply("");
assert.equal(render("A").isReplyInFlight, true);
// Home leaves the activated shell mounted; returning reuses these hook slots.
await Promise.resolve();
assert.equal(pending[0].signal.aborted, false);
assert.equal(render("A").isReplyInFlight, true);
assert.equal(render("B").isReplyInFlight, false);
const firstB = render("B").handleSendAndReply("");
assert.equal(render("B").isReplyInFlight, true);
assert.equal(render("A").isReplyInFlight, true, "returning to A restores its running state");
await render("A").handleSendAndReply("");
assert.equal(pending.length, 2, "navigation must not allow a duplicate request");
render("A").stopReply();
assert.equal(pending[0].signal.aborted, true);
assert.equal(pending[1].signal.aborted, false, "stopping A must not abort B");
const secondA = render("A").handleSendAndReply("");
pending[0].complete(); await firstA;
assert.equal(render("A").isReplyInFlight, true, "a cancelled request settling must not clear its replacement");
pending[1].complete(); await firstB;
assert.equal(render("B").isReplyInFlight, false);
assert.equal(render("A").isReplyInFlight, true);
pending[2].complete(); await secondA;
assert.equal(render("A").isReplyInFlight, false);
console.log("PASS navigation retains active replies; scope restoration, duplicate prevention and cancellation ownership verified");
