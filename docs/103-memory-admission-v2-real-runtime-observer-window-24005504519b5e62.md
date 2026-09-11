# Stage 4D-3 — Real Runtime Observer Window (Non-authoritative)

Window `window-24005504519b5e62` was executed on the isolated portable synthetic
fixture with the provider configured in the dev profile. The window was closed
after one successful automatic direct-chat extraction and is retained as a
sanitized, non-authoritative artifact.

## Safe outcome

- One logical `chat_reply` action completed with two physical provider attempts
  (fallback-split accounting); no prompt, response, credential, or user-content
  fields were exported.
- The observer appended five metadata-only records: four `VALID_CONTROL` records
  and one `SAFETY_INCIDENT`.
- No `VALID_ELIGIBLE_SUPPRESSION`, `ZERO_CANDIDATE_BATCH`, fail-open, privacy,
  or accounting-conflict record was observed.
- The safety incident was an unmatched V2-native observation (`cross_scope`,
  `exactScope=false`, `provenanceTrusted=false`, `legacyAccepted=false`). It is
  therefore excluded from campaign authority and promotion counts.
- The automatic extraction observer was entered; the trace showed the long-
  evidence gate, observer invocation, canonical after-state, and five collector
  append attempts/successes.

## P0–P4 review

The window has no evidence of a P0/P1/P4 incident. P2/P3 labels are limited to
the shadow classification metrics and are not promotion authority. The
unmatched V2 observation is retained as a safety incident for bridge follow-up;
no production cutover or admission write was enabled.

## Authority decision

`authoritativeEvidence=false`. The campaign manifest is intentionally unchanged:
this window does not advance sessions, suppressions, scopes, days, or batches.
The portable synthetic fixture remains isolated from the historical Stage 4D-11O-R4B
fixture, and no real-user profile or backup was accessed.
