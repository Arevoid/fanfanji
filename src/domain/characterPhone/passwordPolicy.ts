import type { CharacterRelationshipState } from "../relationship/characterRelationship";

export type CharacterPhonePasswordPurpose = "unlock" | "hidden-gallery";

export type CharacterPhonePasswordChangeReason =
  | "user_request"
  | "security_breach"
  | "phone_lost"
  | "major_conflict"
  | "breakup"
  | "trust_change"
  | "reconciliation";

export type CharacterPhonePasswordActionDecision = "accept" | "decline";

export interface CharacterPhonePasswordChangeRequest {
  purpose: CharacterPhonePasswordPurpose;
  passcode: string;
}

export interface CharacterPhonePasswordAction {
  decision: CharacterPhonePasswordActionDecision;
  purpose: CharacterPhonePasswordPurpose;
  passcode?: string;
  reason?: CharacterPhonePasswordChangeReason;
}

export interface CharacterPhonePasswordPolicyInput {
  request?: CharacterPhonePasswordChangeRequest;
  action: CharacterPhonePasswordAction;
  relationship?: CharacterRelationshipState;
  lastChangedAt?: number;
  now?: number;
}

export interface CharacterPhonePasswordPolicyResult {
  allowed: boolean;
  reason:
    | "accepted"
    | "declined"
    | "relationship_not_trusted"
    | "cooldown"
    | "invalid_passcode"
    | "request_mismatch"
    | "missing_major_event";
}

/** Password changes are deliberate life events, not a per-message random roll. */
export const CHARACTER_PHONE_PASSWORD_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const PASSCODE_PATTERN = /^\d{4}$/u;
const PASSCODE_IN_TEXT_PATTERN = /(?<!\d)(\d{4})(?!\d)/u;
const MAJOR_EVENT_REASONS = new Set<CharacterPhonePasswordChangeReason>([
  "security_breach",
  "phone_lost",
  "major_conflict",
  "breakup",
  "trust_change",
  "reconciliation",
]);

function hasPasswordChangeVerb(text: string): boolean {
  return /(?:改|换|设置|设为|设成|修改|更换|重置)\s*(?:一下|个|成|为)?/u.test(text);
}

/**
 * Parse only an explicit four-digit user request. A bare four-digit number is
 * never treated as a password change, so ordinary chat cannot rotate secrets.
 */
export function parseCharacterPhonePasswordChangeRequest(text: string | undefined): CharacterPhonePasswordChangeRequest | undefined {
  const normalized = text?.trim() || "";
  if (!normalized || !hasPasswordChangeVerb(normalized)) return undefined;
  const match = normalized.match(PASSCODE_IN_TEXT_PATTERN);
  if (!match) return undefined;
  const mentionsHiddenGallery = /(?:隐藏|私密|相册|图库)[^。！？!?\n]{0,12}(?:密码|口令|解锁|码)|(?:密码|口令|解锁|码)[^。！？!?\n]{0,12}(?:隐藏|私密|相册|图库)/u.test(normalized);
  const mentionsUnlock = /(?:手机|锁屏|解锁|开机)[^。！？!?\n]{0,12}(?:密码|口令|码)|(?:密码|口令|码)[^。！？!?\n]{0,12}(?:手机|锁屏|解锁|开机)/u.test(normalized);
  if (mentionsHiddenGallery && mentionsUnlock) return undefined;
  return {
    // “改个密码，1234” follows the common phone-unlock meaning. The user
    // can name “相册密码” explicitly when they intend the more sensitive one.
    purpose: mentionsHiddenGallery ? "hidden-gallery" : "unlock",
    passcode: match[1],
  };
}

export function parseCharacterPhonePasswordActionMarker(text: string): {
  action?: CharacterPhonePasswordAction;
  visibleText: string;
  malformed: boolean;
} {
  const markerPattern = /\[\[\s*CHARACTER_PHONE_PASSWORD_CHANGE\s*\]\]\s*(\{[\s\S]*?\})?/u;
  const match = text.match(markerPattern);
  if (!match) return { visibleText: text, malformed: false };
  const visibleText = text.replace(match[0], "").replace(/[ \t]+\n/g, "\n").trim();
  if (!match[1]) return { visibleText, malformed: true };
  try {
    const parsed = JSON.parse(match[1]) as Partial<CharacterPhonePasswordAction>;
    const action: CharacterPhonePasswordAction = {
      decision: parsed.decision === "accept" ? "accept" : "decline",
      purpose: parsed.purpose === "hidden-gallery" ? "hidden-gallery" : "unlock",
      ...(typeof parsed.passcode === "string" ? { passcode: parsed.passcode } : {}),
      ...(typeof parsed.reason === "string" ? { reason: parsed.reason as CharacterPhonePasswordChangeReason } : {}),
    };
    return { action, visibleText, malformed: false };
  } catch {
    return { visibleText, malformed: true };
  }
}

export function evaluateCharacterPhonePasswordChange(input: CharacterPhonePasswordPolicyInput): CharacterPhonePasswordPolicyResult {
  if (input.action.decision !== "accept") return { allowed: false, reason: "declined" };
  if (!input.action.passcode || !PASSCODE_PATTERN.test(input.action.passcode)) {
    return { allowed: false, reason: "invalid_passcode" };
  }
  const now = input.now ?? Date.now();
  if (typeof input.lastChangedAt === "number" && now - input.lastChangedAt < CHARACTER_PHONE_PASSWORD_CHANGE_COOLDOWN_MS) {
    return { allowed: false, reason: "cooldown" };
  }
  if (input.request) {
    if (input.request.purpose !== input.action.purpose || input.request.passcode !== input.action.passcode) {
      return { allowed: false, reason: "request_mismatch" };
    }
    if (input.relationship !== "close_friend" && input.relationship !== "partner") {
      return { allowed: false, reason: "relationship_not_trusted" };
    }
    return { allowed: true, reason: "accepted" };
  }
  if (!input.action.reason || !MAJOR_EVENT_REASONS.has(input.action.reason)) {
    return { allowed: false, reason: "missing_major_event" };
  }
  return { allowed: true, reason: "accepted" };
}

export function isValidCharacterPhonePasscode(value: string | undefined): value is string {
  return typeof value === "string" && PASSCODE_PATTERN.test(value);
}
