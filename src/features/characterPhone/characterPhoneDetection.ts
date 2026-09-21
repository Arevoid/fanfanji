import type { Character } from "../../types";
import type { CharacterPhoneRecord } from "../../domain/characterPhone/types";
import { buildCharacterPhoneActionDiscoveryMessage } from "./characterPhoneReaction";
import { normalizeCharacterPhoneMessages } from "./characterPhoneContent";

export interface CharacterPhoneDiscoveryCandidate {
  action: CharacterPhoneRecord["actionLog"][number];
  shouldAsk: boolean;
  previousDiscoveryCount: number;
}

/**
 * Selects the oldest eligible operation without mutating the phone. The UI
 * can use this candidate to ask the model for a character-specific reaction
 * before committing the discovery message.
 */
export function findCharacterPhoneDiscoveryCandidate(
  phone: CharacterPhoneRecord,
  character: Character,
  now = Date.now(),
): CharacterPhoneDiscoveryCandidate | null {
  const openCount = phone.phoneOpenCount ?? 0;
  const candidate = (phone.actionLog ?? [])
    .filter((action) => !action.discovered && action.detectability !== "none")
    .filter((action) => {
      // Legacy records created by the old UI used zero delays for chat sends.
      // Keep those records, but never let a newly sent message trigger an
      // awareness alert in the same turn. Older records can still be noticed
      // naturally once enough time or phone openings have passed.
      const delay = action.kind === "chat_sent_as_character"
        ? Math.max(action.discoveryAfterMs ?? 12 * 60 * 60 * 1000, 12 * 60 * 60 * 1000)
        : (action.discoveryAfterMs ?? 10 * 60 * 1000);
      const opens = action.kind === "chat_sent_as_character"
        ? Math.max(action.discoveryAfterOpens ?? 3, 3)
        : (action.discoveryAfterOpens ?? 2);
      return now - action.timestamp >= delay
        || openCount - (action.phoneOpenCountAtAction ?? 0) >= opens;
    })
    .sort((left, right) => left.timestamp - right.timestamp)[0];
  if (!candidate) return null;
  return {
    action: candidate,
    shouldAsk: candidate.kind === "chat_sent_as_character"
      || candidate.kind === "contact_removed"
      || candidate.kind === "contact_remark_changed"
      || isAttentivePerson(character),
    previousDiscoveryCount: phone.messages.filter((message) =>
      message.id.startsWith("phone-discovery-") || message.id.startsWith("phone-awareness-"),
    ).length,
  };
}

/**
 * Turns selected hidden operations into an in-world discovery message. The
 * action log itself is never rendered; discovery is delayed until a later
 * opening or until enough time has passed, so every action is not instantly
 * noticed by the character.
 */
export function discoverCharacterPhoneActions(
  phone: CharacterPhoneRecord,
  character: Character,
  now = Date.now(),
  options: { discoveryMessage?: string } = {},
): CharacterPhoneRecord {
  const candidate = findCharacterPhoneDiscoveryCandidate(phone, character, now);
  if (!candidate) return phone;
  const discovery = candidate.shouldAsk
    ? {
        id: `phone-discovery-${candidate.action.id}`,
        sender: character.name,
        body: options.discoveryMessage?.trim()
          || buildCharacterPhoneActionDiscoveryMessage(character, candidate.action, { previousDiscoveryCount: candidate.previousDiscoveryCount }),
        timestamp: now,
        unread: true,
      }
    : undefined;
  const alreadyReported = discovery && phone.messages.some((message) =>
    (message.id.startsWith("phone-discovery-") || message.id.startsWith("phone-awareness-"))
    && message.sender === discovery.sender
    && message.body === discovery.body,
  );
  return {
    ...phone,
    actionLog: (phone.actionLog ?? []).map((action) => action.id === candidate.action.id
      ? { ...action, discovered: true, discoveredAt: now, discoveryResponse: candidate.shouldAsk ? "ask" : "silent" }
      : action),
    messages: normalizeCharacterPhoneMessages(alreadyReported || !discovery ? phone.messages : [...phone.messages, discovery]),
    awarenessLevel: discovery ? Math.max(phone.awarenessLevel ?? 0, 1) as 0 | 1 | 2 : phone.awarenessLevel,
    awarenessUpdatedAt: discovery ? now : phone.awarenessUpdatedAt,
    updatedAt: now,
  };
}

function isAttentivePerson(character: Character): boolean {
  const personality = `${character.personality || ""} ${character.backstory || ""}`;
  if (/(粗心|迟钝|健忘|随和|忙碌|忙|不在意|大大咧咧)/u.test(personality)) return false;
  return /(敏感|细心|警觉|多疑|观察|谨慎|控制欲|在意细节|记性好)/u.test(personality);
}
