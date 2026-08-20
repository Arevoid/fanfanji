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

console.log("latest snapshot writer tests passed");
