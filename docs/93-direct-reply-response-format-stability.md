# Direct Reply Response-Format Stability Diagnosis

Stage: 4D-11O-R2A  
Date: 2026-09-11  
Starting refactor HEAD: `111742c0a055d81b1b231536611b96dc07588a1d`  
Stable original repository: `f515f7408cfe19da145f15a8ddffceae06e608d`

Readiness: `DIRECT_REPLY_RESPONSE_FORMAT_FIX_LOCAL_VALIDATED`

## 1. Runtime fact and safety boundary

R2A sent no new runtime turn. The isolated fixture remains unchanged at
durable=27, eligible=6, trigger=20, distance=14, marker present, exact scope
healthy, and Memory=0. The two user-only failed turns remain intact. No
assistant was fabricated, no extraction or Window was started, and no Provider
configuration was changed.

The preceding R2 run showed that the Provider transport was not globally down:
the recovery probe and one following accumulation turn delivered normally.
The next turn produced two `chat_reply` backend-proxy rows under one parent
action. Both transport attempts completed; the second carried the controlled
`format_validation` retry reason. No usable assistant bubble was delivered.
The Ledger contains only safe status, purpose, model/provider, transport,
attempt and reason metadata; it contains no Prompt, response body, key, or
Authorization field.

## 2. Audited response lifecycle

The production path is:

```text
apiChat transport normalization
→ requestDirectChatResponse
→ normalizeDirectChatResponse (when inner voice is enabled)
→ parseChatTurnResponse
→ one format-repair request when formatIssue is present
→ the same parser/normalizer on the repair result
→ requestDirectChatTurn
→ createDirectReplyCandidates
→ executeDirectReplyTurn
→ deliverDirectReplyCandidates
```

`parseChatTurnResponse` accepts ordinary non-empty plain text. A structured
object is accepted when a recursively readable non-empty `reply`, `content`,
`text`, or `message` value exists. `translation` is optional. `innerVoice` is
optional at the parser boundary and is retained only when both `content` and
`emotionalState` are non-empty strings. A structured-looking object with a
`reply` key but no usable reply is marked `invalid-structured-response`;
malformed/empty structured output therefore enters repair. R2A also fixed the
same classification gap for valid JSON envelopes that expose only
`innerVoice`, `translation`, or a nested envelope key without a usable reply:
these are now format failures rather than raw JSON fallback text. The existing
candidate builder can still return zero messages after a parser-successful
text is cleaned, and the executor reports that separately as `no_response`.

`requestDirectChatResponse` performs at most one repair call using
`CHAT_RESPONSE_FORMAT_RETRY_INSTRUCTION`, the same request/provider/model
boundary, and the same parser. If repair remains format-invalid or empty, it
throws `code=response_format`. The executor stops before candidate creation in
that branch. It does not create a duplicate assistant bubble.

## 3. Blocker classification

The historical runtime evidence remains category **G (insufficient safe
metadata to separate two explicit code paths)**. It proves an initial
format-validation repair occurred and that no assistant was delivered, but it
does not persist a lifecycle outcome that distinguishes:

* **C:** the repair response still violated the same format contract, causing
  terminal `response_format`; or
* **E:** the repair response was parser-usable, but candidate cleanup produced
  zero deliverable bubbles (`no_response`).

Neither a Provider outage, Memory trigger, persistence loss, nor Campaign
failure is supported by the available metadata. No raw response may be
recovered to decide between C and E in this stage.

## 4. Relation to R5E-A and local fix decision

R5E-A correctly added machine-readable `code=response_format`, preserved the
existing user-facing error, bounded repair to one request, and added tests for
valid output, repair success, exhausted repair, zero-candidate normalization,
and user-message durability. R2A confirms those contracts still hold locally.

The static audit did identify and fix one deterministic parser bug in
`parseChatTurnResponse`: valid JSON with structured-envelope signals but no
usable reply previously fell through as raw text. The fix is deliberately
narrow; it does not broaden plain-text compatibility or change the structured
contract. The safe runtime evidence cannot prove that this exact shape was the
historical Provider output, so a future controlled runtime probe should expose
only metadata-only lifecycle stage
(`initial_parse`, `repair_parse`, `terminal_response_format`, or
`candidate_no_response`) so the C/E distinction can be made without recording
response text.

## 5. Local validation

The following focused tests passed without changing production semantics:

* `chatTurnResponseProtocol.test.ts`
* `chatGenerationController.test.ts`
* `directReplyFormatDeliveryInvestigation.test.ts`
* `directReplyTurnExecutor.test.ts`
* `directReplyLifecycleBehavior.test.ts`
* `aiRequestAccounting.test.ts`

No new runtime turn was sent after the R2 blocker. The inherited baseline is
595/595 tests, lint pass, build pass, and dependency gate pass (105
allowlisted edges / 3 baseline cycles). R2A changed only the parser's
structured-missing-reply classification and its focused tests; Memory,
Provider, Prompt, retry policy, delivery policy, and storage behavior were not
changed.

Next stage: `Stage 4D-11O-R2B — Direct Reply Runtime Revalidation + Bounded
Accumulation Resume`, beginning with one controlled probe only after the
metadata gap is accepted. Do not create a governed Window, trigger Memory
extraction, or enter RG2 from the current blocked fixture.
