import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { createMemoryProjectionJob, transitionMemoryProjectionJob } from "../src/domain/memory/memoryProjectionJob";
import type { MemoryProcessingScope } from "../src/domain/memory/memorySourceProcessingCursor";

Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });

const {
  MEMORY_PROJECTION_DB_NAME,
  MEMORY_PROJECTION_DB_VERSION,
  MEMORY_PROJECTION_JOB_STORE_NAME,
  MEMORY_PROJECTION_JOB_INDEXES,
} = await import("../src/core/storage/memoryProjectionJobDb");
const { MemoryProjectionJobIndexedDbRepository } = await import("../src/core/storage/repositories/memoryProjectionJobRepository");

await new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase(MEMORY_PROJECTION_DB_NAME);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error("test database delete blocked"));
});

const scope: MemoryProcessingScope = {
  characterId: "character-idb",
  relationId: "relation-idb",
  userIdentityId: "identity-idb",
  conversationId: "direct:relation-idb",
};
const otherScope: MemoryProcessingScope = { ...scope, conversationId: "direct:other" };
const makeJob = (targetScope: MemoryProcessingScope = scope, revision = "claims:revision-1:1", kind: "conversation_summary" | "legacy_memory_mirror" = "conversation_summary") =>
  createMemoryProjectionJob({
    projectionKind: kind,
    scope: targetScope,
    canonicalRefs: [`claim-${targetScope.conversationId}`],
    canonicalRevision: revision,
    createdAt: 100,
  });

const repository = new MemoryProjectionJobIndexedDbRepository();
const job = makeJob();
const inserted = await repository.insertIfAbsent(job);
assert.equal(inserted.kind, "inserted");
assert.deepEqual(await repository.get(job.jobId), job);
assert.deepEqual((await repository.insertIfAbsent(job)).kind, "exists");

const opened = await new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(MEMORY_PROJECTION_DB_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
assert.equal(opened.version, MEMORY_PROJECTION_DB_VERSION);
assert.equal(opened.objectStoreNames.contains(MEMORY_PROJECTION_JOB_STORE_NAME), true);
const store = opened.transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readonly").objectStore(MEMORY_PROJECTION_JOB_STORE_NAME);
assert.deepEqual([...store.indexNames].sort(), [...MEMORY_PROJECTION_JOB_INDEXES].sort());
opened.close();

const secondOwner = new MemoryProjectionJobIndexedDbRepository();
const started = await repository.markRunning(job.jobId, 1, "owner-a", 110, 120);
assert.equal(started.kind, "updated");
assert.equal((started as { job: typeof job }).job.status, "running");
assert.equal((await secondOwner.markRunning(job.jobId, 1, "owner-b", 111, 130)).kind, "conflict");
const completed = await secondOwner.markCompleted(job.jobId, 2, 115);
assert.equal(completed.kind, "updated");
assert.equal((await repository.markCompleted(job.jobId, 2, 116)).kind, "conflict", "terminal state is fenced by version");

const failedJob = makeJob(scope, "claims:revision-2:1");
await repository.insertIfAbsent(failedJob);
assert.equal((await repository.markRunning(failedJob.jobId, 1, "owner-a", 120, 140)).kind, "updated");
assert.equal((await repository.markFailed(failedJob.jobId, 2, "SUMMARY_WRITE_FAILED", 125)).kind, "updated");
assert.equal((await repository.markRunning(failedJob.jobId, 3, "owner-a", 126, 150)).kind, "conflict", "failed jobs require explicit retry transition");
const failedSnapshot = await repository.get(failedJob.jobId);
assert.ok(failedSnapshot);
const retried = transitionMemoryProjectionJob(failedSnapshot, { type: "retry" }, 126);
assert.equal((await repository.compareAndSet(failedJob.jobId, 3, retried)).kind, "updated");
assert.equal((await repository.markRunning(failedJob.jobId, 4, "owner-a", 127, 150)).kind, "updated");

const reclaimJob = makeJob(otherScope, "claims:revision-3:1");
await repository.insertIfAbsent(reclaimJob);
await repository.markRunning(reclaimJob.jobId, 1, "expired-owner", 130, 135);
const reclaimed = await secondOwner.reclaimExpired(140, "new-owner", 160);
assert.equal(reclaimed.length, 1);
assert.equal(reclaimed[0]?.lease?.ownerId, "new-owner");
assert.equal(reclaimed[0]?.version, 3);

const legacyJob = makeJob(otherScope, "claims:revision-legacy:1", "legacy_memory_mirror");
await repository.insertIfAbsent(legacyJob);
const pendingJob = makeJob(scope, "claims:revision-pending:1");
await repository.insertIfAbsent(pendingJob);
assert.equal((await repository.listByScope(scope, "conversation_summary")).length, 3);
assert.equal((await repository.listByScope(otherScope, "legacy_memory_mirror")).length, 1);
assert.equal((await repository.listPending({ scope, projectionKind: "conversation_summary" })).length, 1);
assert.equal((await repository.listPending({ scope: otherScope, includeExpiredRunning: true, now: 170 })).length, 2);

repository.close();
const reopened = new MemoryProjectionJobIndexedDbRepository();
assert.deepEqual(await reopened.get(job.jobId), await secondOwner.get(job.jobId), "job survives repository close/reopen");

const raw = await new Promise<Record<string, unknown>>((resolve, reject) => {
  const request = indexedDB.open(MEMORY_PROJECTION_DB_NAME);
  request.onsuccess = () => {
    const database = request.result;
    const read = database.transaction(MEMORY_PROJECTION_JOB_STORE_NAME, "readonly")
      .objectStore(MEMORY_PROJECTION_JOB_STORE_NAME).get(job.jobId);
    read.onsuccess = () => { database.close(); resolve(read.result as Record<string, unknown>); };
    read.onerror = () => reject(read.error);
  };
  request.onerror = () => reject(request.error);
});
for (const forbidden of ["statement", "summary", "prompt", "transcript", "evidenceQuote", "apiKey", "authorization"]) {
  assert.equal(Object.prototype.hasOwnProperty.call(raw, forbidden), false, `job does not persist ${forbidden}`);
}

secondOwner.close();
reopened.close();
const availableIndexedDb = globalThis.indexedDB;
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
await assert.rejects(
  () => new MemoryProjectionJobIndexedDbRepository().get(job.jobId),
  (error: unknown) => error instanceof Error && error.message === "memory_projection_repository_unavailable",
);
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: availableIndexedDb });
console.log("memory projection IndexedDB repository tests passed");
