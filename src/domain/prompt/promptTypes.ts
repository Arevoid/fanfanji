/**
 * The shape consumed by apiChat after a prompt has been assembled.  Builders
 * intentionally accept pre-resolved values: fetching memories, matching World
 * Book entries, reading time and handling UI state remain at their call sites.
 */
export type PromptScenario =
  | "direct-chat"
  | "group-chat"
  | "proactive-message"
  | "regenerate"
  | "moment-post"
  | "moment-comment"
  | "moment-reply"
  | "offline-story"
  | "diary"
  | "inner-voice"
  | "forum-thread"
  | "forum-activity"
  | "forum-story-initial"
  | "forum-story-comment"
  | "forum-story-update";

export interface PromptHistoryEntry {
  // apiChat historically accepts the caller's role string without narrowing it.
  role: string;
  text: string;
}

export interface PromptHistoryInjection {
  id: string;
  sourceId?: string;
  /** 1 = immediately before the latest historical message. */
  depth: number;
  content: string;
}

export interface PromptContext {
  scenario: PromptScenario;
  /** The already formatted current user/task message. */
  message: string;
  /** The already filtered and ordered recent chat history. */
  history: PromptHistoryEntry[];
  /**
   * The exact system text assembled by the caller, including character data,
   * World Book blocks, recalled memories and time-sensitive context.
   */
  systemInstruction: string;
  historyInjections?: readonly PromptHistoryInjection[];
}

export interface ComposedPrompt {
  message: string;
  history: PromptHistoryEntry[];
  systemInstruction: string;
}
