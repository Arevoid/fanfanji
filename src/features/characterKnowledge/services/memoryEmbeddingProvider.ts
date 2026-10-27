export interface MemoryEmbeddingConfiguration { enabled: boolean; apiEndpoint: string; model: string; apiKey: string; minimumSimilarity?: number; indexRequestsPerDay?:number;queryRequestsPerDay?:number;charactersPerDay?:number;indexPaused?:boolean }
export async function requestMemoryEmbeddings(input: { configuration: MemoryEmbeddingConfiguration; texts: readonly string[];
  signal?: AbortSignal; fetch?: typeof fetch; onUsage?: (usage: { inputTokens?: number; totalTokens?: number; outputTokens?: number }) => void }): Promise<number[][]> {
  const { configuration, texts } = input;
  if (!configuration.enabled || !configuration.apiKey || !configuration.model || !texts.length || texts.length > 64
    || texts.some((text) => !text.trim() || text.length > 2000)) throw new Error("invalid_embedding_request");
  const endpoint = new URL(configuration.apiEndpoint);
  if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("invalid_embedding_endpoint");
  const url = endpoint.href.replace(/\/+$/u, "").replace(/\/embeddings$/u, "") + "/embeddings";
  const response = await (input.fetch || fetch)(url, { method: "POST", headers: {
    "Content-Type": "application/json", Authorization: `Bearer ${configuration.apiKey}` },
    body: JSON.stringify({ model: configuration.model, input: texts }),
    signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`embedding_status_${response.status}`);
  const body = await response.json();
  const tokenCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
  if (body.usage) input.onUsage?.({ inputTokens: tokenCount(body.usage.prompt_tokens), totalTokens: tokenCount(body.usage.total_tokens), outputTokens: 0 });
  if (!Array.isArray(body.data) || body.data.length !== texts.length) throw new Error("invalid_embedding_response");
  const vectors: number[][] = Array(texts.length);
  for (const row of body.data) {
    if (!Number.isInteger(row.index) || row.index < 0 || row.index >= texts.length || vectors[row.index]
      || !Array.isArray(row.embedding)) throw new Error("invalid_embedding_response");
    vectors[row.index] = row.embedding;
  }
  return vectors;
}
