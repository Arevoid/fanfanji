import { isProviderSafetyNotice } from "../../../utils/textApiError";

/** Only decode JSON data. Never evaluate model text or repair a truncated list. */
export function decodeRelationshipPeopleResponse(raw: string): unknown[] {
  const text = raw.trim().replace(/^\uFEFF/u, "");
  if (isProviderSafetyNotice(text)) throw new Error("人物提取被模型供应商的内容策略拒绝，未保存人物。不会自动重试。");
  const withoutThought = text.replace(/<(?:think|thinking|analysis)>[\s\S]*?<\/(?:think|thinking|analysis)>/giu, "");
  const candidates = [withoutThought];
  for (const match of withoutThought.matchAll(/```(?:json|jsonl)?\s*([\s\S]*?)```/giu)) candidates.push(match[1]);
  // Balanced outer objects/arrays support explanatory prefixes and suffixes,
  // including braces, quotes and commas inside JSON string values.
  let start = -1; let quoted = false; let escaped = false; const stack: string[] = [];
  for (let index = 0; index < withoutThought.length; index++) {
    const char = withoutThought[index];
    if (start < 0) {
      if (char === "{" || char === "[") { start = index; stack.push(char); quoted = false; escaped = false; }
      continue;
    }
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; continue; }
    if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") {
      const open = stack.pop();
      if (open !== (char === "}" ? "{" : "[")) { start = -1; stack.length = 0; continue; }
      if (!stack.length) { candidates.push(withoutThought.slice(start, index + 1)); start = -1; }
    }
  }
  const rows = (value: any, depth = 0): unknown[] | undefined => {
    if (depth < 2 && typeof value === "string") { try { return rows(JSON.parse(value), depth + 1); } catch { return undefined; } }
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.people)) return value.people;
    return undefined;
  };
  for (const candidate of candidates) {
    try { const result = rows(JSON.parse(candidate)); if (result) return result; } catch { /* try a complete framed block */ }
  }
  if (start >= 0) throw new Error("人物提取返回不完整，可能被截断；未保存人物，不会自动重试。");
  throw new Error("关联人物返回格式无法解析，未保存任何人物。不会自动重试。");
}
