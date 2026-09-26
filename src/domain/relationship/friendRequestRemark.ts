import type { Character, Message } from "../../types";
import type { CharacterRelationship } from "./characterRelationship";

type RemarkStyle = "direct" | "soft" | "sharp" | "calm" | "plain";

const CONTEXT_WINDOW_MS = 48 * 60 * 60 * 1000;

function normalize(value: string | undefined): string {
  return (value || "").replace(/\s+/gu, " ").trim();
}

function hasAny(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function resolveStyle(character: Pick<Character, "personality" | "backstory">): RemarkStyle {
  const persona = `${character.personality || ""} ${character.backstory || ""}`;
  if (hasAny(persona, ["傲娇", "嘴硬", "毒舌", "强势", "霸道"])) return "sharp";
  if (hasAny(persona, ["温柔", "体贴", "细腻", "敏感", "善解人意"])) return "soft";
  if (hasAny(persona, ["冷静", "理性", "克制", "成熟", "稳重"])) return "calm";
  if (hasAny(persona, ["直率", "坦率", "爽快", "直接"])) return "direct";
  return "plain";
}

function recentContext(messages: readonly Message[] | undefined, now: number): string {
  return (messages || [])
    .filter((message) => message.content.trim() && message.timestamp <= now && now - message.timestamp <= CONTEXT_WINDOW_MS)
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-12)
    .map((message) => message.content.trim())
    .join(" ");
}

/**
 * Builds the character's friend-request remark from relationship and recent
 * conversation evidence. This is intentionally local and deterministic: the
 * request must be available immediately after blocking, without a second API
 * turn or a chance of exposing an internal prompt to the user.
 */
export function buildAdaptiveFriendRequestRemark(input: {
  character: Pick<Character, "personality" | "backstory">;
  relationship: Pick<CharacterRelationship, "relationship">;
  recentMessages?: readonly Message[];
  attempt?: number;
  now?: number;
}): string {
  const attempt = Math.max(1, input.attempt || 1);
  const context = recentContext(input.recentMessages, input.now ?? Date.now());
  const persona = `${input.character.personality || ""} ${input.character.backstory || ""}`;
  const style = resolveStyle(input.character);
  const conflict = hasAny(context, ["吵架", "生气", "争吵", "争执", "误会", "分手", "滚", "讨厌", "不理", "别联系", "委屈", "失望", "拉黑"]);
  const warmth = hasAny(context, ["想你", "喜欢", "爱你", "晚安", "抱", "陪你", "宝贝", "亲爱的", "开心"]);
  const closeRelation = input.relationship.relationship === "partner" || input.relationship.relationship === "close_friend";

  if (attempt >= 3) {
    if (conflict) return style === "sharp"
      ? "你还在生气我知道，但我再试一次不是想纠缠你，只是还没准备把我们停在这里。"
      : "我知道你还在生气，但我再试一次不是想纠缠你，只是还没准备把我们停在这里。";
    return closeRelation
      ? "我再试一次，不是想打扰你，只是不想我们就这样断掉。你愿意的话，给我一个说清楚的机会。"
      : "我还是想再试一次。如果你愿意，给我一句回复，让我知道这段关系还有没有补救的可能。";
  }

  if (conflict) {
    if (attempt === 2) {
      if (style === "sharp") return "行，你先气着。但别把我关在门外，我还没把该说的话说完。";
      if (style === "soft") return "我知道你还在难受，我不会逼你马上原谅我。能不能先别拉黑我，让我把话说清楚？";
      if (style === "calm") return "我知道我们还在争执。先别把我拉黑，好吗？把原因说清楚，再决定之后要怎么办。";
      return "我知道你还在生气，但能不能先别把我拉黑？给我一次解释的机会。";
    }
    if (style === "sharp") return "生气归生气，别真把我拉黑。我还没说完，给我一次解释的机会。";
    if (style === "soft") return "我知道你生气了，是不是我让你难受了？别急着把我拉黑，好不好？";
    if (style === "calm") return "生气归生气，先别把我拉黑，好吗？我们把原因说清楚，再决定要不要继续联系。";
    return "生气归生气，但不要拉黑我好不好？我想和你把话说清楚。";
  }

  if (warmth || closeRelation) {
    if (style === "sharp") return "刚刚还好好的，你突然拉黑我是什么意思？我不接受你一句话都不留。";
    if (style === "soft") return "刚刚明明还好好的，是不是我哪里让你难过了？别突然把我拉黑，好吗？";
    if (style === "calm") return "我们刚才还在好好说话。我想知道发生了什么，能不能先别把我拉黑？";
    return "我们刚刚还好好的，你为什么突然拉黑我？给我一个解释，好吗？";
  }

  if (style === "sharp") return "为什么突然拉黑我？至少把原因说清楚，别让我自己猜。";
  if (style === "soft") return "是不是我哪里做错了？你可以告诉我，但别突然把我拉黑，好吗？";
  if (style === "calm") return "我没弄清楚发生了什么。你愿意的话，告诉我原因，我们再决定要不要继续联系。";
  if (style === "direct") return "你为什么突然拉黑我？有问题就直接说，别让我猜。";
  return "你为什么突然拉黑我？如果我做错了什么，能不能告诉我原因？";
}
