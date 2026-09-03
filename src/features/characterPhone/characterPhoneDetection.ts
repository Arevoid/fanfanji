import type { Character } from "../../types";
import type { CharacterPhoneRecord } from "../../domain/characterPhone/types";
import { buildCharacterPhoneActionDiscoveryMessage } from "./characterPhoneReaction";
import { normalizeCharacterPhoneMessages } from "./characterPhoneContent";

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
): CharacterPhoneRecord {
  const openCount = phone.phoneOpenCount ?? 0;
  const candidate = (phone.actionLog ?? [])
    .filter((action) => !action.discovered && action.detectability !== "none")
    .filter((action) => now - action.timestamp >= 10 * 60 * 1000 || openCount >= (action.discoveryAfterOpens ?? 2))
    .sort((left, right) => left.timestamp - right.timestamp)[0];
  if (!candidate) return phone;
  const discovery = {
    id: `phone-discovery-${candidate.id}`,
    sender: character.name,
    body: buildCharacterPhoneActionDiscoveryMessage(character, candidate),
    timestamp: now,
    unread: true,
  };
  const alreadyReported = phone.messages.some((message) =>
    (message.id.startsWith("phone-discovery-") || message.id.startsWith("phone-awareness-"))
    && message.sender === discovery.sender
    && message.body === discovery.body,
  );
  return {
    ...phone,
    actionLog: (phone.actionLog ?? []).map((action) => action.id === candidate.id
      ? { ...action, discovered: true, discoveredAt: now }
      : action),
    messages: normalizeCharacterPhoneMessages(alreadyReported ? phone.messages : [...phone.messages, discovery]),
    awarenessLevel: Math.max(phone.awarenessLevel ?? 0, 1) as 0 | 1 | 2,
    awarenessUpdatedAt: now,
    updatedAt: now,
  };
}
