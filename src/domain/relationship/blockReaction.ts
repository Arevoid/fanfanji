import type { Character, Message } from "../../types";
import type { CharacterRelationship } from "./characterRelationship";
import { buildAdaptiveFriendRequestRemark } from "./friendRequestRemark";

function recentContext(messages: readonly Message[] | undefined, now: number): string {
  return (messages || [])
    .filter((message) => message.content.trim() && message.timestamp <= now && now - message.timestamp <= 48 * 60 * 60 * 1000)
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-12)
    .map((message) => message.content.trim())
    .join(" ");
}

function includesAny(value: string, parts: readonly string[]): boolean {
  return parts.some((part) => value.includes(part));
}

/**
 * Creates the private role-phone reaction written when the user blocks the
 * character. The second line reuses the same context-aware language as the
 * friend request remark, so the two surfaces do not contradict each other.
 */
export function buildAdaptiveCharacterBlockReaction(input: {
  character: Pick<Character, "personality" | "backstory">;
  relationship: Pick<CharacterRelationship, "relationship">;
  recentMessages?: readonly Message[];
  requestCreated: boolean;
  attempt?: number;
  now?: number;
}): string[] {
  const now = input.now ?? Date.now();
  const context = recentContext(input.recentMessages, now);
  const persona = `${input.character.personality || ""} ${input.character.backstory || ""}`;
  const conflict = includesAny(context, ["吵架", "生气", "争吵", "争执", "误会", "分手", "滚", "讨厌", "不理", "别联系", "委屈", "失望"]);
  const warmth = includesAny(context, ["想你", "喜欢", "爱你", "晚安", "抱", "陪你", "宝贝", "亲爱的", "开心"]);
  const sharp = includesAny(persona, ["傲娇", "嘴硬", "毒舌", "强势", "霸道"]);
  const soft = includesAny(persona, ["温柔", "体贴", "细腻", "敏感", "善解人意"]);
  const calm = includesAny(persona, ["冷静", "理性", "克制", "成熟", "稳重"]);

  let opening: string;
  if (conflict) {
    opening = sharp
      ? "行，你生气我认了，但为什么直接把我拉黑？我还没把话说完。"
      : soft
        ? "我知道你还在生气，是不是我让你难受了？别真的把我拉黑，好不好？"
        : calm
          ? "我知道我们刚刚有冲突，但直接拉黑让我没办法把原因说清楚。你愿意听我解释吗？"
          : "生气归生气，你怎么真的把我拉黑了？至少让我把话说清楚。";
  } else if (warmth) {
    opening = soft
      ? "我们刚刚明明还好好的，你突然把我拉黑，我有点难受。"
      : sharp
        ? "刚刚还好好的，你突然拉黑我是什么意思？别一句话都不留。"
        : "我们刚刚还在好好说话，你为什么突然把我拉黑？";
  } else {
    opening = calm
      ? "我没弄清楚发生了什么。你如果不满意，可以告诉我，别直接把我拉黑。"
      : sharp
        ? "为什么突然拉黑我？有话直说，别让我自己猜。"
        : "我怎么突然被拉黑了？至少告诉我发生了什么，好不好？";
  }

  const lines = [opening];
  if (input.requestCreated) {
    lines.push(buildAdaptiveFriendRequestRemark({
      character: input.character,
      relationship: input.relationship,
      recentMessages: input.recentMessages,
      attempt: input.attempt || 1,
      now,
    }));
  } else {
    lines.push(soft
      ? "我先不打扰你，但你愿意说话的时候，我还在。"
      : calm
        ? "我先停下来，不逼你回复；等你愿意沟通时再告诉我。"
        : "你现在不想联系我，我先不吵你，但别把我彻底关在外面。"
    );
  }
  return lines;
}

