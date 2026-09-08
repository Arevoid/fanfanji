import * as LZStringModule from "lz-string";
import type { MemoryItem } from "../../types";

const LZString = ((LZStringModule as typeof LZStringModule & { default?: typeof LZStringModule }).default ?? LZStringModule) as typeof import("lz-string");

export const MEMORY_COMPRESSION_PREFIX = "__fanfanji_memory_lz_v1__:";
export const DEFAULT_MEMORY_COMPRESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_MEMORY_COMPRESSION_MIN_LENGTH = 120;

export interface MemoryCompressionResult {
  processed: number;
  compressed: number;
  bytesBefore: number;
  bytesAfter: number;
  skippedManual: number;
}

export function decompressMemoryContent(content: string): string {
  if (!content.startsWith(MEMORY_COMPRESSION_PREFIX)) return content;
  const compressed = content.slice(MEMORY_COMPRESSION_PREFIX.length);
  return LZString.decompressFromUTF16(compressed) || content;
}

export function compressMemoryContent(content: string): string {
  if (!content || content.startsWith(MEMORY_COMPRESSION_PREFIX)) return content;
  const compressed = LZString.compressToUTF16(content);
  const candidate = `${MEMORY_COMPRESSION_PREFIX}${compressed}`;
  return candidate.length < content.length ? candidate : content;
}

export function isMemoryEligibleForCompression(
  memory: MemoryItem,
  now = Date.now(),
  ageMs = DEFAULT_MEMORY_COMPRESSION_AGE_MS,
  minLength = DEFAULT_MEMORY_COMPRESSION_MIN_LENGTH,
): boolean {
  if (memory.isManual || memory.recallDisabled) return false;
  if (memory.content.length < minLength) return false;
  if (!Number.isFinite(memory.timestamp) || now - memory.timestamp < ageMs) return false;
  // High-importance memories remain plain for easier diagnostics and export;
  // their content is small compared with the long-tail generated memories.
  if ((memory.importance ?? 5) >= 9) return false;
  return true;
}

export function compressMemoriesForStorage(
  memories: readonly MemoryItem[],
  now = Date.now(),
): { records: MemoryItem[]; result: MemoryCompressionResult } {
  let processed = 0;
  let compressed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  let skippedManual = 0;
  const records = memories.map((memory) => {
    const content = memory.content;
    if (memory.isManual) skippedManual += 1;
    if (!isMemoryEligibleForCompression(memory, now)) {
      return memory;
    }
    processed += 1;
    const compressedContent = compressMemoryContent(content);
    bytesBefore += content.length * 2;
    bytesAfter += compressedContent.length * 2;
    if (compressedContent === content) return memory;
    compressed += 1;
    return { ...memory, content: compressedContent };
  });
  return { records, result: { processed, compressed, bytesBefore, bytesAfter, skippedManual } };
}

export function formatMemoryCompressionResult(result: MemoryCompressionResult): string {
  const released = Math.max(0, result.bytesBefore - result.bytesAfter);
  if (result.compressed === 0) return `已检查 ${result.processed} 条旧记忆，暂时没有可压缩内容。`;
  const size = released >= 1024 * 1024
    ? `${(released / (1024 * 1024)).toFixed(2)} MB`
    : `${(released / 1024).toFixed(1)} KB`;
  return `已压缩 ${result.compressed} 条旧记忆，预计释放约 ${size}；手动记忆未被改动。`;
}

