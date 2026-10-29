import { isProviderSafetyNotice } from "../../../utils/textApiError";
import { validateReadingChapterAnalysisResponse } from "./readingAnalysisProtocol";

/** Decode complete data only; never invent missing JSON or accept prose as a story bible. */
export function parseReadingStoryResponse(raw: string): unknown {
  const text = raw.trim().replace(/^\uFEFF/u, "");
  if (isProviderSafetyNotice(text)) throw new Error("小说识别请求被模型供应商的内容策略拒绝。未保存识别结果，不会自动重试。");
  if (!text) throw new Error("小说识别没有收到文本返回。未保存识别结果，不会自动重试。");
  const clean = text.replace(/<(?:think|thinking|analysis)>[\s\S]*?<\/(?:think|thinking|analysis)>/giu, "");
  const candidates = [clean];
  for (const match of clean.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)) candidates.push(match[1]);
  let start = -1; let quoted = false; let escaped = false; const stack: string[] = [];
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index];
    if (start < 0) { if (char === "{" || char === "[") { start = index; stack.push(char); } continue; }
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; continue; }
    if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") {
      const opening = stack.pop();
      if (opening !== (char === "}" ? "{" : "[")) { start = -1; stack.length = 0; continue; }
      if (!stack.length) { candidates.push(clean.slice(start, index + 1)); start = -1; }
    }
  }
  const unwrap = (value: unknown, depth = 0): unknown => {
    if (depth > 3) return value;
    if (typeof value === "string") { try { return unwrap(JSON.parse(value), depth + 1); } catch { return value; } }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if ("summary" in record) return value;
      for (const key of ["analysis", "result", "data"]) if (record[key] !== undefined) return unwrap(record[key], depth + 1);
    }
    return value;
  };
  let parsed: unknown;
  let hasParsed = false;
  for (const candidate of candidates) {
    try {
      const value = unwrap(JSON.parse(candidate));
      if (validateReadingChapterAnalysisResponse(value).ok) return value;
      if (!hasParsed) { parsed = value; hasParsed = true; }
    } catch { /* Only try complete local JSON blocks; no extra provider request. */ }
  }
  if (hasParsed) return parsed; // Caller reports field validation separately.
  if (start >= 0) throw new Error("小说识别返回不完整，可能已被截断。未保存识别结果，不会自动重试。");
  throw new Error("模型返回了说明文字或无法解析的数据，未返回小说识别所需的 JSON。未保存识别结果，不会自动重试。");
}
