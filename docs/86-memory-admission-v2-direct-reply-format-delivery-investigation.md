# Stage 4D-11O-R5E-A — Direct Reply Format Validation & Delivery Investigation

## Scope and runtime fact

This stage investigated the single R5E synthetic Direct Chat turn that produced
a durable user message but no confirmed assistant message. No additional real
turn was sent, no reload was performed, and the temporary fixture was not
reset. Provider, Prompt, Memory, Admission, Campaign, and persistence schemas
were not changed.

Before the turn the dedicated fixture was healthy with zero durable messages,
zero eligible messages, trigger distance 20, no archive marker, Memory count 0,
and `exactScopeHealth=true`. After the one turn, the existing metadata store
contained one durable user record and no assistant record; the inspector showed
one eligible message, distance 19, no marker, and no Memory write. The UI left
the loading state but did not show a confirmed assistant bubble.

The current ledger contains two `chat_reply` records for this turn (the
original request and its format-repair request), plus one background
`moment_generate` record. The latter is independently accounted for and is not
causal to the direct reply path based on the available state evidence.

## Format-validation source and contract

`requestDirectChatResponse()` in
`src/features/chat/controllers/chatGenerationController.ts` is the exact
source of `format_validation`:

1. It calls `requestAiReply()` and normalizes the result with
   `parseChatTurnResponse()` when inner voice is enabled.
2. A structured-looking object containing a `reply` field but no usable reply
   is returned by the parser as `formatIssue="invalid-structured-response"`.
3. The controller makes one request-local repair call with
   `CHAT_RESPONSE_FORMAT_RETRY_INSTRUCTION` and the controlled ledger reason
   `response format validation` (normalized to `format_validation`).
4. If that response is still invalid or empty, it throws the same user-facing
   format error and does not create candidates.

The accepted direct envelope is a JSON object whose usable reply is a non-empty
string (or a recursively readable `content`, `text`, `message`, or `reply`
value). Optional `translation` and `innerVoice` fields are accepted; inner
voice requires non-empty `content` and `emotionalState` strings. Plain text
remains accepted for ordinary responses. Multi-bubble delivery is derived from
the normalized reply text after existing cleanup and paragraph splitting.

No full Prompt or Provider response is recorded here. The available runtime
evidence proves that the first response reached the format-validation retry;
because response bodies are intentionally not logged, it cannot distinguish
whether the repair response was malformed/empty or whether a later cleanup
produced zero candidate content.

## Accounting interpretation

`apiChat()` wraps every call in its own `withAiRequestLedger()` session. Thus:

- one user turn with one format retry creates two logical `chat_reply` records;
- both records carry the same `parentActionId` and each has its own
  `logicalActionId`/`requestId`;
- `providerRequestCount` is the number of transport attempts inside one ledger
  record, so each observed record reports 1;
- the two records correspond to two physical backend Provider calls;
- `retryCount=1` on the repair record counts its controlled retry reason; it is
  not an additional attempt count inside that record;
- no fallback was recorded for `chat_reply` in this turn.

The background `moment_generate` record is separate, with its own purpose and
accounting (`providerRequestCount=2`, fallback count 1, reason
`backend_network`).

## Candidate, delivery, and completion path

The normal path is:

`requestDirectChatTurn`
→ `requestDirectChatResponseWithContextRecovery`
→ `requestDirectChatResponse`
→ `parseChatTurnResponse`
→ App normalization
→ `createDirectReplyCandidates`
→ `executeDirectReplyTurn`
→ `deliverDirectReplyCandidates`
→ `onSendMessageRaw`
→ `confirmMessageDurability`.

`createDirectReplyCandidates()` can return an empty array when cleanup removes
all content (for example, a fake-image-only narration, internal marker-only
text, simulated-user content, or an otherwise empty normalized reply). It does
not throw for that condition. The executor reports `no_response`; the use case
maps that terminal state to an explicit parse failure outcome, and AppChat
publishes the existing controlled error toast. Delivery exceptions are wrapped
in `DirectReplyDeliveryError` and preserve already delivered message IDs.

When format retry is exhausted, the executor stops before candidate creation,
returns `status="failed"`, `phase="parsed"`, and invokes the durability
callback for the already-created user message. The outer AppChat `finally`
always clears typing/loading state. Therefore the observed “loading ended with
no assistant bubble” is a controlled failed turn, not a successful empty
delivery. The toast is transient (1.5 seconds), which explains why a later
browser snapshot may not show it.

## Minimal fix

The format-exhaustion error now carries machine-readable `code="response_format"`
while preserving the exact existing user-facing message. This closes the
classification gap in `classifyDirectReplyError()`, which otherwise labeled
the terminal parse error as `unknown`. No Prompt, Provider, retry policy,
candidate filtering, delivery, Memory, or Campaign behavior changed.

## Regression coverage

`scripts/directReplyFormatDeliveryInvestigation.test.ts` covers:

- valid provider result → candidate → delivered bubble;
- first format-invalid result → one repair call → delivered bubble;
- format-retry exhaustion → explicit parsed failure and zero delivery;
- zero-candidate normalization → explicit `no_response` result;
- provider/format failure still reaching the user-message durability boundary.

Existing controller, parser, executor, lifecycle, durable-completion,
direct-chat-service, and accounting tests remain green.

## Safety and readiness

- New real user messages in this investigation: 0.
- Reload validation: not repeated.
- Automatic extraction / `extractNow()`: 0.
- Memory writes: 0; archive marker absent.
- Campaign/window/token/collector/shadow/canary: unchanged and unused.
- User data: only the existing isolated synthetic user record remains; no
  production data was touched.

Full validation completed with 595/595 tests passed, lint passed, build passed,
and dependency direction passed (105 allowlisted edges / 3 baseline cycles).
Readiness: `DIRECT_REPLY_COMPLETION_FIX_LOCAL_VALIDATED`. The next step is a separate
**Stage 4D-11O-R5E-R1 — Direct Reply Completion Real Runtime Revalidation**
with exactly one new synthetic turn. Do not rerun R5E or enter R5R in this
stage.
