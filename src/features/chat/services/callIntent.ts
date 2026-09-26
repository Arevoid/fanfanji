import type { ProactiveActionType } from "./proactiveActionProtocol";

export type CallMedia = "voice" | "video";
export type CallDirection = "incoming" | "outgoing";
export type CallIntentSource = "user" | "ai" | "scheduler";

/**
 * Canonical call intent shared by user requests, AI directives and the
 * proactive scheduler.  Keeping direction and media independent prevents a
 * video request from silently falling back to an outgoing voice call.
 */
export interface CallIntent {
  id: string;
  direction: CallDirection;
  media: CallMedia;
  source: CallIntentSource;
  characterId: string;
  relationId?: string;
  conversationId?: string;
  userIdentityId?: string;
  responseBatchId?: string;
  triggerMessageId?: string;
  reason?: string;
}

export interface CallActionDirective {
  type: ProactiveActionType;
  reason: string;
}

export interface ParsedCallAction {
  visibleText: string;
  directive?: CallActionDirective;
  error?: "multiple_directives" | "malformed_json" | "invalid_directive";
}

const ACTION_MARKERS = [
  { start: "[[CALL_ACTION]]", end: "[[/CALL_ACTION]]" },
  { start: "[[PROACTIVE_ACTION]]", end: "[[/PROACTIVE_ACTION]]" },
] as const;

function cleanVisibleText(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

function parseDirective(value: unknown): CallActionDirective | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "call" && raw.type !== "video_call") return undefined;
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (!reason || reason.length > 200) return undefined;
  return { type: raw.type, reason };
}

/**
 * Parses the private call action emitted alongside visible AI text. Both the
 * current proactive marker and the lk-inspired CALL_ACTION marker are
 * accepted during migration; neither marker is allowed to leak into chat.
 */
export function parseCallActionDirective(input: { text: string }): ParsedCallAction {
  const matches: Array<{ body: string }> = [];
  let visible = input.text;

  for (const marker of ACTION_MARKERS) {
    let startIndex = visible.indexOf(marker.start);
    while (startIndex >= 0) {
      const endIndex = visible.indexOf(marker.end, startIndex + marker.start.length);
      if (endIndex < 0) {
        // Remove an incomplete private block as well; protocol fragments must
        // never become visible chat content.
        visible = `${visible.slice(0, startIndex)}${visible.slice(startIndex + marker.start.length)}`;
        break;
      }
      matches.push({ body: visible.slice(startIndex + marker.start.length, endIndex) });
      visible = `${visible.slice(0, startIndex)}${visible.slice(endIndex + marker.end.length)}`;
      startIndex = visible.indexOf(marker.start);
    }
    visible = visible.replaceAll(marker.end, "");
  }

  const visibleText = cleanVisibleText(visible);
  if (matches.length === 0) return { visibleText };
  if (matches.length > 1) return { visibleText, error: "multiple_directives" };

  try {
    const directive = parseDirective(JSON.parse(matches[0].body.trim()));
    return directive ? { visibleText, directive } : { visibleText, error: "invalid_directive" };
  } catch {
    return { visibleText, error: "malformed_json" };
  }
}

export function mediaFromCallAction(type: ProactiveActionType): CallMedia {
  return type === "video_call" ? "video" : "voice";
}

export function createCallIntentId(input: Pick<CallIntent, "source" | "characterId" | "relationId" | "responseBatchId" | "triggerMessageId">): string {
  return [
    "call",
    input.source,
    input.characterId,
    input.relationId || "no-relation",
    input.responseBatchId || input.triggerMessageId || "no-trigger",
  ].join(":");
}

/** Returns true only for a new intent in the supplied in-memory registry. */
export function acceptCallIntent(registry: Set<string>, intent: CallIntent): boolean {
  if (registry.has(intent.id)) return false;
  registry.add(intent.id);
  return true;
}
