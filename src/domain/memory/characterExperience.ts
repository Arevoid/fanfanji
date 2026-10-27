/** Subjective reflection, never evidence that a fictional event happened. */
export interface CharacterExperience {
  kind: "insight" | "strong_emotion";
  reflection: string;
  quote: string;
  significance: number;
  reason: string;
}
export function normalizeCharacterExperience(raw: unknown, body: string): CharacterExperience | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const value = raw as Partial<CharacterExperience>;
  if (!["insight", "strong_emotion"].includes(value.kind || "")
    || typeof value.reflection !== "string" || value.reflection.trim().length < 8 || value.reflection.length > 400
    || typeof value.quote !== "string" || value.quote.trim().length < 8 || value.quote.length > 500 || !body.includes(value.quote)
    || typeof value.reason !== "string" || value.reason.trim().length < 12 || value.reason.length > 400
    || typeof value.significance !== "number" || !Number.isFinite(value.significance) || value.significance < .85 || value.significance > 1) return;
  return { kind: value.kind!, reflection: value.reflection.trim(), quote: value.quote,
    significance: value.significance, reason: value.reason.trim() };
}
export const CHARACTER_EXPERIENCE_INSTRUCTION = `
可选字段 experience，默认 null，不要求产出。只有角色本人在本次实际接触中确有具体的新感悟，或受到显著情绪触动时填写：
{"kind":"insight或strong_emotion","reflection":"自然表达角色自身感悟或当时情绪，不描述用户属性或认定共同事件","quote":"本次角色正文中连续原话，8—500字","significance":0.85,"reason":"具体解释为何值得长期保留，至少12字"}。
普通评论、寒暄、推荐、读完/看完/听过、轻微喜恶不算。允许完全不留经历；不要为了归档编造感悟或强烈情绪。
作品情节和网友故事不是角色亲历；一次触动不是稳定人格改变，不推断用户性格，不宣称关系升级，不把猜测写成事实。
只依据本次可见来源和角色实际表达，不补写未接触内容。无充分依据返回 null，失败不补发请求。
`;
