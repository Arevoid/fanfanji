import assert from "node:assert/strict";
import { parseReadingStoryResponse } from "../src/features/reading/analysis/readingStoryResponse";
import { prepareReadingStorySource } from "../src/features/reading/analysis/readingStoryPreparation";
import { readingAssetDb } from "../src/core/storage/readingAssetDb";
import { saveReadingStore } from "../src/core/storage/repositories/readingRepository";
import { listReadingAnalysisEntities, listReadingAnalysisTasks } from "../src/core/storage/repositories/readingAnalysisRepository";
import type { ReadingBook } from "../src/domain/reading/types";

const valid = { summary: "林舟在旧城寻找失踪的家人", keyPoints: ["寻找家人"], entities: [{ kind: "character", name: "林舟", aliases: [], summary: "寻找家人", attributes: {}, confidence: 0.9 }], premise: "旧城寻人", worldRules: ["现代城市"], storyLines: ["寻找家人"], timeline: [] };
const json = JSON.stringify(valid);
for (const text of [json, `说明\n\`\`\`json\n${json}\n\`\`\`\n结束`, JSON.stringify(json), JSON.stringify({ result: valid }), `<think>检查格式</think>${json}`]) {
  assert.deepEqual(parseReadingStoryResponse(text), valid);
}
assert.throws(() => parseReadingStoryResponse('{"summary":"未完成", "entities":['), /不完整|截断/);
assert.throws(() => parseReadingStoryResponse("我无法完成这次识别。"), /说明文字|JSON/);
assert.throws(() => parseReadingStoryResponse("The prompt could not be submitted. The prompt contains sensitive words that violate Google's Generative AI Prohibited Use policy."), /内容策略/);
assert.throws(() => parseReadingStoryResponse(""), /没有收到/);

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new MemoryStorage() } });
const originalLoad = readingAssetDb.load;
const originalFetch = globalThis.fetch;
let requests = 0;
let raw = json;
globalThis.fetch = (async () => {
  requests++;
  return new Response(JSON.stringify({ text: raw }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const text = "林舟在旧城寻找家人。";
readingAssetDb.load = async (assetId, userIdentityId, bookId) => ({ assetId, userIdentityId, bookId, contentHash: "hash", mimeType: "text/plain", byteLength: text.length, blob: new Blob([text]), createdAt: 1 });
try {
  for (const [index, response] of [JSON.stringify({ data: valid }), '{"summary":"截断', JSON.stringify({ summary: "缺少核心信息", entities: [] })].entries()) {
    const book: ReadingBook = { id: `book-${index}`, userIdentityId: "owner", assetId: "asset", contentHash: "hash", format: "txt", status: "ready", title: "旧城", sourceFileName: "story.txt", sourceMimeType: "text/plain", sourceEncoding: "utf-8", byteLength: text.length, wordCount: text.length, chapterCount: 1, createdAt: 1, updatedAt: 1 };
    saveReadingStore({ version: 1, books: [book], chapters: [{ id: `chapter-${index}`, userIdentityId: "owner", bookId: book.id, order: 0, title: "第一章", wordCount: text.length }], paragraphAnchors: [], progress: [], annotations: [], preferences: [], assetCleanupTasks: [] });
    raw = response;
    const before = requests;
    const operation = prepareReadingStorySource({ book, settings: { apiKey: "test-only", selectedModel: "test-model", apiEndpoint: "https://example.test/v1" } });
    const scope = { userIdentityId: "owner", bookId: book.id };
    if (index === 0) {
      const result = await operation;
      assert.equal(result.coreCharacters[0].name, "林舟");
    } else {
      await assert.rejects(operation, /不完整|核心人物/);
      assert.equal(listReadingAnalysisEntities(scope).length, 0, "failed extraction must not persist partial people");
      assert.equal(listReadingAnalysisTasks(scope)[0].status, "failed");
    }
    assert.equal(requests - before, 1, "one explicit recognition never silently retries");
  }
} finally {
  globalThis.fetch = originalFetch;
  readingAssetDb.load = originalLoad;
}
console.log("PASS reading story format compatibility, failure isolation and single request");
