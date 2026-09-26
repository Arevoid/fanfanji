import type { Character, Message } from "../../types";
import type { CharacterRelationship } from "./characterRelationship";

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

function stableVariant(seed: string | undefined): number {
  if (!seed) return 0;
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return hash % 2;
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
  variationSeed?: string;
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
  const variant = stableVariant(input.variationSeed);

  let opening: string;
  if (conflict) {
    opening = sharp
      ? (variant ? "行，你生气我认了，但别把我直接关在门外。我还有话想当面说清楚。" : "行，你生气我认了，但为什么直接把我拉黑？我还没把话说完。")
      : soft
        ? (variant ? "我知道你还在难受，我先不替自己辩解；但别把我从你的世界里直接划掉，好吗？" : "我知道你还在生气，是不是我让你难受了？别真的把我拉黑，好不好？")
        : calm
          ? (variant ? "我知道我们刚刚有冲突。你可以先冷静，但请留一个让我把原因说清楚的机会。" : "我知道我们刚刚有冲突，但直接拉黑让我没办法把原因说清楚。你愿意听我解释吗？")
          : (variant ? "你可以生气，但别突然把门关上。我想知道到底是哪句话让你这么难受。" : "生气归生气，你怎么真的把我拉黑了？至少让我把话说清楚。");
  } else if (warmth) {
    opening = soft
      ? (variant ? "刚才还在说话，你突然把我拉黑，我一下不知道该怎么接了。" : "我们刚刚明明还好好的，你突然把我拉黑，我有点难受。")
      : sharp
        ? (variant ? "刚才还好好的，你一句解释都没留就把我拉黑了？至少回我一句。" : "刚刚还好好的，你突然拉黑我是什么意思？别一句话都不留。")
        : (variant ? "我们刚才还在好好说话，我想知道是哪一步突然变了。" : "我们刚刚还在好好说话，你为什么突然把我拉黑？");
  } else {
    opening = calm
      ? (variant ? "我还不知道发生了什么。你不满意可以直接告诉我，不必用拉黑把话截断。" : "我没弄清楚发生了什么。你如果不满意，可以告诉我，别直接把我拉黑。")
      : sharp
        ? (variant ? "我被你突然关掉了？有话就直说，别让我对着沉默猜。" : "为什么突然拉黑我？有话直说，别让我自己猜。")
        : (variant ? "我还没弄明白为什么会被拉黑。你愿意的话，告诉我发生了什么。" : "我怎么突然被拉黑了？至少告诉我发生了什么，好不好？");
  }

  const lines = [opening];
  if (input.requestCreated) {
    // The private phone reaction should explain the next action without
    // repeating the same “why did you block me?” sentence as the opening.
    lines.push(soft
      ? "我先把好友申请发过去，不催你马上回复；你愿意时，再告诉我发生了什么。"
      : calm
        ? "我把好友申请发过去了。等你愿意沟通时，我们把这件事说清楚。"
        : sharp
          ? "我把申请发过去了。你可以继续生气，但别把我永远关在门外。"
          : (variant ? "我先发好友申请，至少给我们留一个把话说完的机会。" : "我已经发了好友申请，等你愿意时给我一个回复。"));
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
