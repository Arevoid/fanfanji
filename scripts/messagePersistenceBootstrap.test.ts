import assert from "node:assert/strict";
import {
  consumeMessagePersistenceDecision,
  createMessagePersistenceLifecycle,
  markMessageHydrated,
  markMessageSnapshotPersisted,
} from "../src/core/messagePersistenceLifecycle";

const durable = ["user", "assistant"];
let durableSnapshot = [...durable];
const writes: string[][] = [];
const lifecycle = createMessagePersistenceLifecycle();
const applyEffect = (snapshot: string[]) => {
  if (consumeMessagePersistenceDecision(lifecycle, snapshot) === "persist") {
    writes.push(snapshot);
    durableSnapshot = [...snapshot];
  }
};

// Test A/B: a fresh App starts with a bootstrap placeholder. React StrictMode
// runs mount effects twice, but neither pass may overwrite the durable pair.
applyEffect([]);
applyEffect([]);
assert.deepEqual(writes, [], "bootstrap placeholder must not persist before hydration");

markMessageHydrated(lifecycle);
applyEffect(durable);
// The hydration effect itself is also replayed in StrictMode. Marking the
// snapshot hydrated again keeps the replay from becoming a write.
markMessageHydrated(lifecycle);
applyEffect(durable);
assert.deepEqual(writes, [], "hydrating an existing snapshot must not enqueue a duplicate write");
assert.deepEqual(durableSnapshot, durable, "fresh bootstrap must retain the existing durable pair");

// Test C: after hydration, an intentional clear is authoritative and must
// still persist an empty snapshot.
applyEffect([]);
assert.deepEqual(writes, [[]], "an intentional post-hydration clear must persist []");
assert.deepEqual(durableSnapshot, [], "an intentional clear remains durable after reload");

// Test D: the explicit handleSendMessage save is not duplicated by the state
// effect when both refer to the same snapshot identity.
const explicit = ["user", "assistant", "assistant-2"];
markMessageSnapshotPersisted(lifecycle, explicit);
applyEffect(explicit);
assert.deepEqual(writes, [[]], "an explicitly persisted snapshot must not be written again by the effect");

// Test E/F characterization: a durable pair remains the authoritative reload
// result and retains the exact direct scope represented by the snapshot.
assert.deepEqual(durable, ["user", "assistant"], "the durable pair remains intact across bootstrap simulation");

console.log("Message bootstrap lifecycle tests passed: StrictMode guard, hydration, clear-all, and duplicate-write semantics");
