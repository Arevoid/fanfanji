import type { ComposedPrompt, PromptContext } from "./promptTypes";

/**
 * Pure boundary between feature code and the AI client.
 *
 * It deliberately does not retrieve data or alter text. Keeping references to
 * the assembled values also preserves every existing delimiter, whitespace,
 * history slice and ordering rule while the large legacy prompt builders are
 * migrated incrementally.
 */
export class PromptComposer {
  static compose(context: PromptContext): ComposedPrompt {
    switch (context.scenario) {
      case "direct-chat":
      case "group-chat":
      case "proactive-message":
      case "regenerate":
      case "moment-post":
      case "moment-comment":
      case "moment-reply":
        return {
          message: context.message,
          history: context.history,
          systemInstruction: context.systemInstruction,
        };
    }
  }
}
