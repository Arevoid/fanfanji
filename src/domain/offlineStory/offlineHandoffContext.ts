import type { Message, OfflineHandoffFact } from "../../types";
import { serializeMessageContentForPrompt } from "../../features/chat/prompts/messagePromptSerializer";

const RELATIVE_TIME_PATTERN = /(今天|今晚|明天|明晚|后天|下周|这周|本周|周[一二三四五六日天]|等下|待会|稍后|之后|晚上|中午|下午|上午|早上|半夜)/u;
const PLAN_PATTERN = /(约好|约定|安排|计划|打算|准备|要去|要吃|想吃|一起|见面|回家|上班|值班|下班|上半天|半天|接你|送你|火锅|螺蛳粉|牛杂|午饭|晚饭|早餐|吃饭)/u;
// Keep enough structured facts to cover a normal handoff while preferring
// older user commitments over repetitive character chatter when the limit is
// reached. The raw snapshot remains capped separately for prompt size.
const FACT_LIMIT = 96;
export const OFFLINE_HANDOFF_MESSAGE_LIMIT = 200;

const cleanText = (value: string): string => value.replace(/\s+/gu, " ").trim();

const localDate = (timestamp: number, dayOffset: number): Date => {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + dayOffset);
  return date;
};

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function resolveRelativeTime(text: string, timestamp: number): string | undefined {
  const dayOffset = text.includes("后天") ? 2 : text.includes("明天") || text.includes("明晚") ? 1 : 0;
  const hasDayReference = dayOffset > 0 || /今天|今晚|这周|本周|下周|周[一二三四五六日天]/u.test(text);
  if (!hasDayReference) return undefined;

  const date = formatDate(localDate(timestamp, dayOffset));
  const period = text.match(/明晚|今晚|晚上|中午|下午|上午|早上|半夜|明天|今天|后天/u)?.[0];
  return `${date}${period && !/明天|今天|后天/u.test(period) ? ` ${period}` : ""}（原文含“${period || "相对时间"}”）`;
}

function factKind(text: string): OfflineHandoffFact["kind"] {
  if (/上班|值班|下班|上半天|半天|工作|课程|上课/u.test(text)) return "schedule";
  if (/吃|火锅|螺蛳粉|牛杂|午饭|晚饭|早餐|见面|约|安排|计划|接你|送你|回家|一起/u.test(text)) return "plan";
  if (/喜欢|不喜欢|想要|偏好|讨厌|爱吃/u.test(text)) return "preference";
  return "context";
}

/**
 * Builds a small deterministic bridge from a raw online chat to an offline
 * story. It deliberately keeps the user's exact wording and source IDs, while
 * adding an absolute local date for relative words so the model cannot freely
 * reinterpret “明天/明晚”.
 */
export function buildOfflineHandoffFacts(messages: readonly Message[]): OfflineHandoffFact[] {
  const facts: OfflineHandoffFact[] = [];
  const seen = new Set<string>();

  messages
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp)
    .forEach((message) => {
      const text = cleanText(serializeMessageContentForPrompt(message, { mode: "history" }));
      if (!text || (!RELATIVE_TIME_PATTERN.test(text) && !PLAN_PATTERN.test(text))) return;
      const dedupeKey = `${message.sender}:${text}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      facts.push({
        id: `handoff-fact-${message.id}`,
        sourceMessageIds: [message.id],
        speaker: message.sender,
        kind: factKind(text),
        content: text,
        normalizedTime: resolveRelativeTime(text, message.timestamp),
        sourceTimestamp: message.timestamp,
      });
    });

  if (facts.length <= FACT_LIMIT) return facts;
  const userFacts = facts.filter((fact) => fact.speaker === "user");
  const characterFacts = facts.filter((fact) => fact.speaker === "character");
  const userBudget = Math.min(userFacts.length, Math.ceil(FACT_LIMIT * 0.65));
  const characterBudget = FACT_LIMIT - userBudget;
  return [
    ...userFacts.slice(-userBudget),
    ...characterFacts.slice(-characterBudget),
  ].sort((left, right) => left.sourceTimestamp - right.sourceTimestamp);
}

export function formatOfflineHandoffFactsForPrompt(facts: readonly OfflineHandoffFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts
    .slice()
    .sort((left, right) => left.sourceTimestamp - right.sourceTimestamp)
    .map((fact) => {
      const speaker = fact.speaker === "user" ? "用户" : "角色";
      const time = fact.normalizedTime ? `；已换算时间：${fact.normalizedTime}` : "";
      return `- [${speaker}/${fact.kind}] ${fact.content}${time}`;
    });
  return `【线上交接事实（优先级高于普通续写）】
以下事实来自转入线下前的线上聊天原文。除非用户在当前线下故事中明确修改，否则不得改写、替换或擅自提前/延后这些事实；较新的明确用户说法优先于较早说法。相对时间已按原消息发送时间换算为本地日期。
${lines.join("\n")}`;
}
