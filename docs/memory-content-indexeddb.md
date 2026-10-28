# Memory content persistence

`FanfanjiMemoryContentDB` owns memory claims, summaries, legacy memory cards,
continuity, source mutation intents, memory settings/progress, and diary records.
The exact routing rules live in `memoryContentKeys.ts`. Unrelated preferences
still use the existing storage adapter. No provider requests occur in migration.

## Startup and migration

Acquire the existing origin-wide writer permission, then initialize memory
content before running memory promotion, source recovery, or mounting App.
An unreadable database never becomes an empty successful snapshot.

Without an active database manifest, LocalStorage is the migration authority.
Validate its JSON and the old transaction journal first. A pending old journal
selects its `before` values; a committed one selects the current values.
Copy records in bounded batches, read back and compare, and verify that the
legacy inputs and writer permission have not changed. Publish the active marker
inside IndexedDB before removing only the verified, unchanged legacy copies.
No LocalStorage migration marker or large rollback snapshot is needed.

An interrupted copy leaves its source untouched. Restart reconciles partial rows
by stable record identity and order, including duplicate IDs. A readonly window
can display the consistent legacy snapshot but cannot perform migration.

## Reads and commits

Existing synchronous repositories read a startup-hydrated working snapshot.
This compatibility cache still loads the memory dataset at startup; fully lazy
asynchronous retrieval is not claimed by this change.

Arrays and top-level array fields are separate records. Dataset manifests keep
their shape and scalar fields. Owner/scope indexes contain only explicit IDs.
Changes compare record payloads and write only changed/deleted records. All
staged changes in a flush share one IndexedDB transaction across datasets.

`StorageWriteResult.pending` means accepted into the working snapshot, **not
durably saved**. Its `durable` promise or `confirmMemoryPersistence()` must finish
before a UI reports success, a source mutation removes evidence, or an archive
acknowledges its cursor. The domain memory write coordinator awaits durable
receipts without depending on a concrete storage engine.

On commit failure, discard pending changes, invalidate the writer session and
surface a bounded diagnostic. The previously committed records remain intact.
Derived projections retain their existing separately-rebuildable semantics.
Cross-database source operations use their existing durable recovery intent;
they are not advertised as a single cross-database transaction.

## Backups and recovery

Old v2/v3 backup key names remain the logical wire format. Export reads committed
memory from IndexedDB rather than from physical LocalStorage. Import prepares
memory changes before its atomic memory commit and resets absent dataset-owned
metadata on full imports. Appearance-only imports do not touch memory.

Diagnostics distinguish memory IndexedDB failures from LocalStorage failures.
Data size is an estimate, not the browser's exact database quota. Stored failure
metadata contains dataset keys, error category and time, never memory text.
Physical database loss and browser eviction still require an external backup.
