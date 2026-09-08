# fanfanji V2 refactor working contract

## Read first

Before changing code, read `docs/00-v2-overview.md`, `docs/01-current-boundaries.md`,
`docs/02-dependency-direction.md`, `docs/03-ai-invocation-inventory.md`,
`docs/04-ai-request-envelope.md`, `docs/05-ai-request-ledger.md`,
`docs/06-testing-and-observability.md`, `docs/08-data-and-rollback.md`,
`docs/09-privacy-and-user-data.md`, `docs/10-contribution-checklist.md`, and the
authoritative `docs/character-state-architecture.md`.

## Scope guard

- The canonical identity/state semantics in `docs/character-state-architecture.md`
  are authoritative. Do not redefine them in a refactor document or infer identity
  from names, avatars, or filenames.
- This batch is infrastructure only: contracts, dependency gates, AI request
  accounting, and tests that observe existing behavior.
- Do not rewrite prompts, context selection, worldbook/truth/memory/relationship
  semantics, provider selection, retry/fallback policy, UI layout, `AppChat`,
  `AppCharacterPhone`, or IndexedDB schemas.
- Do not delete data, localStorage keys, IndexedDB records, tests, dead code, or
  dependencies to make a check pass.
- Do not introduce a new AI client, provider, transport, storage engine, or durable
  copy of prompts/API keys. The request ledger stores metadata only.

## Dependency direction

New imports must pass `scripts/dependencyDirectionBaseline.test.ts`:

- UI/page code must not import provider clients or concrete storage engines.
- Domain code must not import feature or UI code.
- Core ports/contracts must not import concrete features.
- An adapter may depend on a port/contract; the reverse is forbidden.
- The three pre-existing cycles are explicitly allowlisted and may not increase.

## AI accounting

Wrap existing calls with the request ledger without changing request payloads or
control flow. Durable records may contain IDs, purpose, provider/model, redacted
endpoint/transport, timing, outcome, token estimates/usage, retry/fallback counts
and reasons, and uncertain-delivery status. Never persist full prompts, chat history,
API keys, authorization headers, or raw provider bodies in the ledger.

## Verification and commits

Run the narrowest relevant test after each change, then finish with:

```text
npm run lint
npm test
npm run build
```

Keep commits single-purpose and reversible. The first batch uses these themes:

1. `docs: add V2 architecture and development contracts`
2. `test: add dependency direction baseline`
3. `refactor: add AI request envelope and detailed request ledger`
4. `test: add AI request accounting coverage`

