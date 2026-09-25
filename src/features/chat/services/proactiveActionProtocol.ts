const PROACTIVE_ACTION_START = "[[PROACTIVE_ACTION]]";
const PROACTIVE_ACTION_END = "[[/PROACTIVE_ACTION]]";
const MAX_REASON_LENGTH = 200;

export type ProactiveActionType = "call" | "video_call";

export interface ProactiveActionDirective {
  type: ProactiveActionType;
  reason: string;
}

export type ProactiveActionDirectiveError = "multiple_directives" | "malformed_json" | "invalid_directive";

export interface ProactiveActionParseResult {
  visibleText: string;
  directive?: ProactiveActionDirective;
  error?: ProactiveActionDirectiveError;
}

const cleanVisibleText = (value: string): string => value.replace(/\n{3,}/g, "\n\n").trim();

function validateDirective(value: unknown): ProactiveActionDirective | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "call" && raw.type !== "video_call") return undefined;
  if (typeof raw.reason !== "string") return undefined;
  const reason = raw.reason.trim();
  if (!reason || reason.length > MAX_REASON_LENGTH) return undefined;
  return { type: raw.type, reason };
}

/**
 * Parses the private action block emitted by proactive chat generation.
 * Action metadata is always removed from visible text, including malformed or
 * incomplete model output, so protocol details can never leak into a chat.
 */
export function parseProactiveActionDirective(input: { text: string }): ProactiveActionParseResult {
  const completePattern = /\[\[PROACTIVE_ACTION\]\]([\s\S]*?)\[\[\/PROACTIVE_ACTION\]\]/g;
  const matches = [...input.text.matchAll(completePattern)];
  const withoutComplete = input.text.replace(completePattern, "");
  const unmatchedStart = withoutComplete.indexOf(PROACTIVE_ACTION_START);
  const withoutResidual = unmatchedStart >= 0 ? withoutComplete.slice(0, unmatchedStart) : withoutComplete;
  const visibleText = cleanVisibleText(withoutResidual.replaceAll(PROACTIVE_ACTION_END, ""));

  if (matches.length === 0) return { visibleText };
  if (matches.length > 1) return { visibleText, error: "multiple_directives" };
  try {
    const directive = validateDirective(JSON.parse(matches[0][1].trim()));
    return directive ? { visibleText, directive } : { visibleText, error: "invalid_directive" };
  } catch {
    return { visibleText, error: "malformed_json" };
  }
}

export { PROACTIVE_ACTION_START, PROACTIVE_ACTION_END };
