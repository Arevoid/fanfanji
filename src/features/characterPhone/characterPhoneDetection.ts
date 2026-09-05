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
    .filter((action) => now - action.timestamp >= (action.discoveryAfterMs ?? 10 * 60 * 1000)
      || openCount - (action.phoneOpenCountAtAction ?? 0) >= (action.discoveryAfterOpens ?? 2))
    .sort((left, right) => left.timestamp - right.timestamp)[0];
  if (!candidate) return phone;
  const shouldAsk = candidate.kind === "chat_sent_as_character"
    || candidate.kind === "contact_removed"
    || candidate.kind === "contact_remark_changed"
    || isAttentivePerson(character);
  const discovery = shouldAsk
    ? {
        id: `phone-discovery-${candidate.id}`,
        sender: character.name,
        body: buildCharacterPhoneActionDiscoveryMessage(character, candidate),
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
    actionLog: (phone.actionLog ?? []).map((action) => action.id === candidate.id
      ? { ...action, discovered: true, discoveredAt: now, discoveryResponse: shouldAsk ? "ask" : "silent" }
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
