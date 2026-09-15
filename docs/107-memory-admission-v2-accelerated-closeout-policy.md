# Memory Admission V2 — Accelerated Closeout Policy (Promotion Policy 2)

Status: local policy revision for the final synthetic Admission closeout.
This document records the decision without changing historical evidence
artifacts or promoting the feature.

## Decision

`memory-admission-v2-promotion-2` requires:

- at least 5 reviewed formal sessions;
- at least 10 valid cancelled-plan suppressions;
- at least 3 distinct exact promotion scopes;
- at least 20 automatic extraction batches;
- at least 5 distinct authoritative UTC evidence days; and
- zero safety, privacy, and accounting incidents (plus the existing
  provenance, scope, correlation, replay, cursor, provider-delta, and
  blocking-regression gates).

The actual campaign evidence remains five distinct days. No timestamp,
counter, evidence record, closure, or historical artifact is rewritten.

## Why the calendar gate changed

The original policy required seven real evidence days alongside the 20-batch
sample. Its purpose was observation duration and date diversity. Review of the
completed campaign shows that days 6–7 add no independent safety property:
the safety decision is already fail-closed on exact scope, trusted runtime
provenance, unique shared lineage, candidate-local Safety-veto validation,
zero unauthorized writes, zero cursor/replay loops, zero provider/prompt
delta, zero privacy/accounting/safety incidents, durable normal-path writes,
and verified rollback. The 20-batch gate remains independent and is still
required, so a shorter calendar span cannot substitute for sample volume.

This is a policy-only revision. Runtime message rendering, extraction,
provenance, Admission, collector, and rollback architecture are unchanged.
The campaign remains paused and promotion still requires an explicit reviewer
authorization. If promotion is later authorized, observation continues to the
original seven-day horizon and the existing rollback remains available.

## Closeout evidence snapshot

The final governed synthetic control produced one logical action and one
physical Provider attempt with no retry, then persisted one authoritative
artifact through the normal path. The cumulative campaign state is:

```text
formal sessions       16
exact scopes           4
automatic batches      20
valid controls         14
valid suppressions     10
evidence days          5
safety/privacy/accounting incidents 0/0/0
```

These values are reviewed from sanitized campaign metadata only; no real user
data or credential is part of this policy record.
