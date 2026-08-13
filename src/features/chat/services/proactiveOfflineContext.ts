import type { Message } from "../../../types";
import type { ProactiveOfflineContextEvidence } from "../../../domain/schedule/proactiveOfflineEligibility";

const NATURAL_LEAD_IN = /(?:有空|空闲|休息|放假|周末|明天|后天|今晚|下午|上午|无聊|想见|见面|一起|吃饭|电影|逛|出去|出门|旅行|旅游|来找|去找|过来|过去|附近|同城|约会|free|weekend|meet|visit|travel|같이|만나|주말|쉬는|会う|一緒|週末|休み)/iu;
const USER_UNAVAILABLE = /(?:不方便|没空|没有空|走不开|不能见|不想见|别来|不要来|改天吧|下次吧|最近很忙|not available|can't meet|cannot meet|don't come|바빠|못 만나|오지 마|会えない|来ないで)/iu;
const USER_SAME_AREA = /(?:我(?:就)?在你(?:家|公司|学校)?(?:楼下|门口|附近)|我就在附近|我们在同一个城市|我们同城|你现在过来|现在来找我|到我这里来|i(?:'m| am) (?:nearby|outside)|same city|나 근처|같은 도시|近くにいる|同じ街)/iu;

const visibleText = (message: Message) => message.content?.trim() || "";

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
