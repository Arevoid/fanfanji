# World Book runtime contract

This document records the V2 World Book behavior so future changes do not
silently change recall scope or prompt placement.

## Read scope

- Direct chat, regeneration, proactive chat, offline story, and character-phone
  auxiliary context all use `isWorldBookEntryVisible`.
- Global entries are available in private chat; character/multi-character
  entries require the active character; identity and relationship entries
  require the matching identity/relation IDs.
- Group and public contexts intentionally exclude private identity and
  relationship entries. Public entries must opt in with `visibility: public`.
- `isActive: false` is excluded everywhere.

## Triggering and recall window

- `constant` and `persona_rule` entries are always selected when visible.
- `keys` entries use normalized Unicode/whitespace/punctuation matching.
- `vector` entries use the deterministic local semantic vector, cosine
  similarity, a short-token overlap stabilizer, a `0.3` threshold, and Top-8
  results. No provider or second network request is involved.
- Trigger scans contain the current text plus the latest six history messages
  (approximately three chat turns). A topic-shift boundary intentionally
  clears the history portion.

## Placement and budgets

- `after_main_prompt`, `before_char_def`, `after_char_def`, and
  `before_chat_history` remain distinct structural sections in direct chat.
- Single-slot adapters (proactive, group, diary, inner voice, and offline)
  preserve those positions with explicit section labels.
- `at_depth` entries are injected through `PromptComposer` and are not copied
  into the ordinary formatted block.
- Each injected entry is capped at 2,400 characters and the complete World Book
  injection is capped at 12,000 characters. Stable persona reminders are
  deduplicated when their content is already in the structural prompt.

## Persistence and import

- Storage and in-memory props are merged per entry ID using the freshest
  timestamp; unrelated entries are never discarded because another entry is
  newer.
- Malformed or duplicate persisted records are ignored without rewriting the
  original storage value.
- SillyTavern and generic imports preserve trigger, scope, visibility, purpose,
  position, depth, and multi-character bindings. String `insertion_order` values
  are parsed numerically.

## Acceptance

Run `npm test`, `npm run build`, `npm run release:check`, and
`npm run smoke:check` before shipping World Book changes.
