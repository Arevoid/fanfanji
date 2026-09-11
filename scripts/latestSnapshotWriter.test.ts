import assert from "node:assert/strict";
import { createLatestSnapshotWriter } from "../src/core/storage/latestSnapshotWriter";

const persisted: number[] = [];
let releaseFirstWrite: (() => void) | null = null;
let rejectNextWrite = false;

const writer = createLatestSnapshotWriter(
  (value: number) => value,
  async (value) => {
    persisted.push(value);
    if (value === 1) {
      await new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
    }
    if (rejectNextWrite) {
      rejectNextWrite = false;
      throw new Error("expected persistence failure");
    }
  },
);

const firstWrite = writer.enqueue(1);
const secondWrite = writer.enqueue(2);
const thirdWrite = writer.enqueue(3);
assert.equal(persisted.join(","), "1", "the first write starts immediately");
releaseFirstWrite?.();
await Promise.all([firstWrite, secondWrite, thirdWrite]);
assert.deepEqual(persisted, [1, 3], "intermediate snapshots are coalesced");

rejectNextWrite = true;
await assert.rejects(writer.enqueue(4), /expected persistence failure/);
await writer.enqueue(5);
assert.deepEqual(persisted, [1, 3, 4, 5], "a failed write does not poison the writer");

let releaseFlush: (() => void) | null = null;
let flushPersisted = false;
const flushWriter = createLatestSnapshotWriter(
  (value: number) => value,
  async (value) => {
    flushPersisted = value === 10;
    await new Promise<void>((resolve) => { releaseFlush = resolve; });
  },
);
flushWriter.enqueue(10);
let flushCompleted = false;
const flushPromise = flushWriter.flush().then(() => { flushCompleted = true; });
await Promise.resolve();
assert.equal(flushPersisted, true, "flush observes the active persistence transaction");
assert.equal(flushCompleted, false, "flush does not resolve before the write completes");
releaseFlush?.();
await flushPromise;
assert.equal(flushCompleted, true, "flush resolves after the writer becomes idle");

const failedFlushWriter = createLatestSnapshotWriter(
  (value: number) => value,
  async () => { throw new Error("flush persistence failure"); },
);
void failedFlushWriter.enqueue(20).catch(() => undefined);
await assert.rejects(failedFlushWriter.flush(), /flush persistence failure/, "flush reports a completed write failure");

console.log("latest snapshot writer tests passed");
