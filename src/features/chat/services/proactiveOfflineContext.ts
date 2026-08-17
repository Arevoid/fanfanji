import type { Message } from "../../../types";
import type { ProactiveOfflineContextEvidence } from "../../../domain/schedule/proactiveOfflineEligibility";

const NATURAL_LEAD_IN = /(?:有空|空闲|休息|放假|周末|明天|后天|今晚|下午|上午|无聊|想见|见面|一起|吃饭|电影|逛|出去|出门|旅行|旅游|来找|去找|过来|过去|附近|同城|约会|free|weekend|meet|visit|travel|같이|만나|주말|쉬는|会う|一緒|週末|休み)/iu;
const USER_UNAVAILABLE = /(?:不方便|没空|没有空|走不开|不能见|不想见|别来|不要来|改天吧|下次吧|最近很忙|not available|can't meet|cannot meet|don't come|바빠|못 만나|오지 마|会えない|来ないで)/iu;
const USER_SAME_AREA = /(?:我(?:就)?在你(?:家|公司|学校)?(?:楼下|门口|附近)|我就在附近|我们在同一个城市|我们同城|你现在过来|现在来找我|到我这里来|i(?:'m| am) (?:nearby|outside)|same city|나 근처|같은 도시|近くにいる|同じ街)/iu;

/**
 * These patterns are intentionally concrete.  A relationship label, an
 * invitation, or a character saying “I will come” is not proof that both
 * people are already in the same physical scene.  Auto-handoff requires an
 * explicit arrival/doorway signal from each side in the recent online chat.
 */
const HYPOTHETICAL_OR_FUTURE = /(?:如果|要是|下次|以后|改天|有空再|想象|梦里|会来|要来|准备来|打算来|有机会|when i can|someday|next time)/iu;
const USER_PRESENT_NOW = /(?:我(?:已经|刚刚|现在)?(?:到了|到(?:你|你家|家里|门口|楼下|公司|学校)|在(?:你家|你那|门口|楼下|附近|外面|这里|你身边))|我就在(?:门口|楼下|附近|外面|你身边)|我到了|我在门口|我开门了|门我开了|进来吧|过来吧|到我家来|你来我家)/iu;
const CHARACTER_PRESENT_NOW = /(?:我(?:已经|刚刚|现在)?(?:到了|到(?:你|你家|家里|门口|楼下|公司|学校)|在(?:你家|你那|门口|楼下|附近|外面|这里|你身边))|我就在(?:门口|楼下|附近|外面|你身边)|我到了|我在门口|门口等你|我带着(?:东西|饭|礼物|电蚊拍|炖盅)?(?:来了|在门口)|进来吧|开门)/iu;

export type ProactiveOfflinePresenceState =
  | "remote"
  | "arrival_claimed"
  | "co_location_confirmed";

export interface ProactiveOfflinePresenceEvidence {
  state: ProactiveOfflinePresenceState;
  userConfirmedArrival: boolean;
  characterClaimedArrival: boolean;
}

const visibleText = (message: Message) => message.content?.trim() || "";

const isConcretePresenceMessage = (text: string, pattern: RegExp): boolean =>
  Boolean(text) && !HYPOTHETICAL_OR_FUTURE.test(text) && pattern.test(text);

/**
 * Derive a deterministic physical-presence state from the latest online
 * messages.  This is kept separate from invitation eligibility: invitations
 * may be generated from a natural lead-in, while an automatic transition is
 * only allowed after both speakers have made a concrete present-tense claim.
 */
export function deriveProactiveOfflinePresenceEvidence(input: {
  messages: readonly Message[];
}): ProactiveOfflinePresenceEvidence {
  const recent = input.messages.filter((message) => !message.isOffline).slice(-10);
  const userConfirmedArrival = recent.some((message) =>
    message.sender === "user" && isConcretePresenceMessage(visibleText(message), USER_PRESENT_NOW));
  const characterClaimedArrival = recent.some((message) =>
    message.sender === "character" && isConcretePresenceMessage(visibleText(message), CHARACTER_PRESENT_NOW));

  return {
    state: userConfirmedArrival && characterClaimedArrival
      ? "co_location_confirmed"
      : userConfirmedArrival || characterClaimedArrival
        ? "arrival_claimed"
        : "remote",
    userConfirmedArrival,
    characterClaimedArrival,
  };
}

/** Conservative factual projection; it never infers location from intimacy. */
export function deriveProactiveOfflineContextEvidence(input: {
  messages: readonly Message[];
  source: "direct_reply" | "proactive_contact";
}): ProactiveOfflineContextEvidence {
  const recent = input.messages.filter((message) => !message.isOffline).slice(-8);
  const recentText = recent.map(visibleText).join("\n");
  const latestUserText = [...recent].reverse().find((message) => message.sender === "user")?.content || "";
  const userSameArea = recent
    .filter((message) => message.sender === "user")
    .some((message) => USER_SAME_AREA.test(visibleText(message)));
  const hasNaturalLeadIn = input.source === "proactive_contact" || userSameArea || NATURAL_LEAD_IN.test(recentText);

  return {
    hasNaturalLeadIn,
    ...(USER_UNAVAILABLE.test(latestUserText) ? { userExplicitlyUnavailable: true } : {}),
    travelFeasibility: userSameArea
      ? "same_area"
      : hasNaturalLeadIn ? "travel_possible" : "unknown",
  };
}
