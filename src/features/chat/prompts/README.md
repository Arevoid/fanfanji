# Chat prompt boundaries

Keep the direct-chat prompt pipeline split by responsibility:

- `domain/prompt/characterPromptProjector.ts` projects character description, personality, and relationship blocks.
- `utils/worldBook.ts` selects visible World Book entries and applies keyword/constant activation.
- `chatPromptPolicy.ts` owns static chat-expression and World Book priority text.
- `chatInstructionAssembler.ts` converts collected instructions to prompt blocks and deduplicates them.
- `components/AppChat.tsx` collects runtime UI state and calls these modules; it should not become the canonical home for reusable prompt text.

These modules must stay pure: do not read or write local storage, mutate character data, or call an API from them. Persisted-data migrations remain under `core/storage` and the relevant domain modules.
