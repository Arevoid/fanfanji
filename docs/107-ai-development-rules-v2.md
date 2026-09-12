# fanfanji V2 — AI Development Rules

These rules are the durable guardrails for future Codex/AI work. They describe
ownership; they do not authorize a production cutover or a broad refactor.

1. New features call the shared AI Runtime (`apiChat` or the approved feature
   service). Browser code must not construct a Provider request directly.
2. Every logical AI operation declares its purpose and uses the governed AI
   accounting/ledger boundary. Retries and fallback attempts remain inside the
   same logical action unless the user explicitly starts a new operation.
3. Prompt text and block order belong to the Context/Prompt runtime. Feature
   code supplies scoped inputs; it does not duplicate WorldBook, Truth,
   Relationship, Scene, or history selection rules.
4. Memory is not Scene, Relationship, Diary, Moments, Offline, or Phone state.
   Memory reads and writes go through the corresponding domain/repository
   service, never through a UI-local ad-hoc array.
5. Canonical scope is based on IDs: `characterId`, `relationId`,
   `userIdentityId`, and `conversationId` where applicable. Names, avatars,
   persona text, or array position never establish ownership.
6. Truth/Knowledge claims are authoritative for direct-chat retrieval;
   summaries and legacy MemoryItem mirrors are derived/compatibility layers.
   Never feed both copies into a prompt when the same claim is already present.
7. Repository code owns persistence and migration. Feature code may use a
   repository seam but must not silently introduce a second storage key or
   bypass migration-sensitive compatibility paths.
8. User data is append/merge-safe by default. Do not clear, reset, migrate,
   import, or read a real backup without explicit scope, a recoverable plan,
   and user approval. Synthetic fixtures must use isolated IDs and namespaces.
9. Every behavior change adds focused tests before extraction. Preserve golden
   Prompt/context equivalence, provider request counts, retry/fallback behavior,
   delivery semantics, persistence, and reload/replay coverage.
10. Run lint, the complete test suite, build, dependency-direction gate, and
    `git diff --check` at each checkpoint. A failing check stops the stage;
    never delete, skip, or weaken tests to obtain a green result.
11. Dependency-direction violations require an explicit baseline edge with
    source, target, and rule/category. Never enlarge an allowlist to hide a new
    edge.
12. Dead-code deletion requires proof: no imports/re-exports/runtime entry,
    no migration or backup requirement, and focused tests demonstrating the
    replacement. “Looks unused” is not proof.
13. Shadow, canary, and evidence collectors are metadata-only unless a
    separately approved stage changes persistence. They must fail open for the
    user-facing operation and never persist prompts, full responses, keys, or
    authorization headers.
14. Admission V2 may veto a proven unsafe legacy write only after exact scope,
    provenance, correlation, validator, and canonical-absence gates pass. It
    may not invent a new positive Memory write.
15. Keep group chat, proactive work, Moments, Diary, Offline, Character Phone,
    Forum, Reading, voice, image, payment, and unrelated background jobs out
    of a Direct Chat refactor unless a tested, explicit dependency requires it.

The current implementation still has compatibility and evidence debt. Future
work must update the relevant audit/architecture document before proposing a
new migration, cutover, or real-user backup request.

