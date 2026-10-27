import { apiFetchModels } from "../../../utils/apiHelper";
import type { MemoryEmbeddingConfiguration } from "./memoryEmbeddingProvider";
export function normalizeMemoryVectorConfiguration(input: MemoryEmbeddingConfiguration): MemoryEmbeddingConfiguration {
  for(const [value,max] of [[input.indexRequestsPerDay,10000],[input.queryRequestsPerDay,10000],[input.charactersPerDay,100_000_000]])if(value!==undefined&&(!Number.isInteger(value)||value<1||value>max))throw new Error("请填写有效的每日向量预算。");
  const next = { ...input, apiEndpoint: input.apiEndpoint.trim(), apiKey: input.apiKey.trim(), model: input.model.trim() };
  if (!next.apiEndpoint || !next.apiKey || !next.model) throw new Error("请填写向量 URL、API Key 和模型。");
  const url = new URL(next.apiEndpoint);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("请填写有效的向量 URL。");
  return { ...next, apiEndpoint: url.href.replace(/\/+$/u, "").replace(/\/embeddings$/u, ""), enabled: true };
}
export async function fetchMemoryVectorModels(input: { apiEndpoint: string; apiKey: string }, request = apiFetchModels): Promise<string[]> {
  if (!input.apiEndpoint.trim() || !input.apiKey.trim()) throw new Error("请先填写向量 URL 和 API Key。");
  const valid = normalizeMemoryVectorConfiguration({ ...input, enabled: true, model: "model-list" });
  const models = await request({ apiEndpoint: valid.apiEndpoint, apiKey: valid.apiKey });
  const unique = [...new Set(models.filter((model) => typeof model === "string" && model.trim() && model.length <= 160).map((model) => model.trim()))];
  if (!unique.length) throw new Error("接口未返回模型，可手动填写模型名。");
  const embedding = (model: string) => /embed|bge|gte|e5-|nomic|jina.*v[234]|minilm/iu.test(model) && !/rerank/iu.test(model);
  return unique.sort((a, b) => Number(embedding(b)) - Number(embedding(a)) || a.localeCompare(b));
}
