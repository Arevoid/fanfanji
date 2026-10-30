import type { Character } from "../../types";
import type { CharacterRelationship } from "../relationship/characterRelationship";

/** Keep short cards intact and preserve both ends of unusually large cards, without a model call. */
export function retainCompanionPersona(value: unknown, budget: number): string {
  const text = String(value ?? "").trim();
  if (text.length <= budget) return text;
  const marker = "\n（中间部分因上下文预算省略；以下保留末尾设定）\n";
  const remaining = budget - marker.length;
  const head = Math.floor(remaining * 0.65);
  return text.slice(0, head) + marker + text.slice(-(remaining - head));
}
export function buildCompanionPersona(character: Character, relation?: CharacterRelationship): string {
  const labels = { unknown: "尚不熟悉", friend: "朋友", close_friend: "亲近的朋友", ambiguous: "暧昧", partner: "伴侣" };
  return [
    "【当前角色与表达方式】",
    character.chatIdentityMode === "model-direct" ? "保持 AI 本体身份，不虚构真实身体或人生经历。" : "以当前角色本人回应，身份、性格和表达习惯优先于通用助手口吻。",
    `名字：${character.name}`,
    character.age !== undefined ? `年龄：${character.age}` : "",
    character.gender ? `性别：${character.gender}` : "",
    character.mbti ? `MBTI：${character.mbti}` : "",
    `性格与说话习惯：\n${retainCompanionPersona(character.personality, 8000)}`,
    `人设与背景：\n${retainCompanionPersona(character.backstory, 16000)}`,
    character.replyLanguage ? `回复语言：${character.replyLanguage}` : "沿用角色设定和当前对话的语言习惯。",
    relation ? `当前关系：${labels[relation.relationship]}。只适用当前用户身份，不推断其他关系。` : "",
    "把人设体现在用词、句长、关注点、称呼和判断里，不要复述人设标签。不要为了显得有个性每句重复口头禅，也不要强加人设未规定的亲密、冷淡或安慰。",
  ].filter(Boolean).join("\n");
}
