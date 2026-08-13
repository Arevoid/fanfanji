import { readingAssetDb } from "../../../core/storage/readingAssetDb";
import { loadReadingStore, saveReadingStore } from "../../../core/storage/repositories/readingRepository";
import type { StorageResult, StorageWriteResult } from "../../../core/storage/storageTypes";
import type { ReadingBook, ReadingBookAsset, ReadingBookFormat, ReadingStore } from "../../../domain/reading/types";
import { parseReadingDocument } from "../library/readingParser";

export type ReadingImportErrorCode =
  | "unsupported-format"
  | "empty-file"
  | "decode-failed"
  | "hash-unavailable"
  | "parse-failed"
  | "asset-write-failed"
  | "metadata-write-failed";

export class ReadingImportError extends Error {
  constructor(public readonly code: ReadingImportErrorCode, message: string) {
    super(message);
    this.name = "ReadingImportError";
  }
}

export interface PreparedReadingImport {
  format: ReadingBookFormat;
  title: string;
  text: string;
  sourceEncoding: string;
  sourceFileName: string;
  sourceMimeType: string;
  sourceByteLength: number;
  contentHash: string;
  characterCount: number;
}

export type ReadingImportFile = Pick<File, "name" | "type" | "size" | "arrayBuffer">;

export type ReadingImportResult =
  | { status: "duplicate"; existingBookIds: string[]; prepared: PreparedReadingImport }
  | { status: "imported"; book: ReadingBook };

interface ReadingAssetStore {
  save(asset: ReadingBookAsset): Promise<void>;
  delete(assetId: string, userIdentityId: string, bookId: string): Promise<boolean>;
}

export interface ReadingImportDependencies {
  loadStore: () => StorageResult<ReadingStore>;
  saveStore: (store: ReadingStore) => StorageWriteResult;
  assetStore: ReadingAssetStore;
  now: () => number;
  createId: (prefix: string) => string;
}

const defaultDependencies: ReadingImportDependencies = {
  loadStore: loadReadingStore,
  saveStore: saveReadingStore,
  assetStore: readingAssetDb,
  now: () => Date.now(),
  createId: (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
};

const extensionOf = (name: string): string => name.split(".").pop()?.toLowerCase() || "";

export function detectReadingBookFormat(file: Pick<ReadingImportFile, "name" | "type">): ReadingBookFormat {
  const extension = extensionOf(file.name);
  if (extension === "txt" || file.type === "text/plain") return "txt";
  if (extension === "md" || extension === "markdown" || file.type === "text/markdown") return "markdown";
  throw new ReadingImportError("unsupported-format", "第一阶段仅支持 TXT 和 Markdown 文件");
}

function decodeWithLabel(bytes: Uint8Array, label: string, fatal: boolean): string {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch {
    throw new ReadingImportError("decode-failed", `无法使用 ${label} 解码文件`);
  }
}

function looksCorrupted(text: string): boolean {
  if (!text) return true;
  const replacementCount = [...text].filter((character) => character === "�").length;
  const nulCount = [...text].filter((character) => character === "\0").length;
  return replacementCount / text.length > 0.01 || nulCount / text.length > 0.01;
}

export function decodeReadingText(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength === 0) throw new ReadingImportError("empty-file", "文件内容为空");

  let decoded: string;
  let encoding: string;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    decoded = decodeWithLabel(bytes.subarray(3), "utf-8", true);
    encoding = "utf-8";
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    decoded = decodeWithLabel(bytes.subarray(2), "utf-16le", true);
    encoding = "utf-16le";
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    decoded = decodeWithLabel(bytes.subarray(2), "utf-16be", true);
    encoding = "utf-16be";
  } else {
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      encoding = "utf-8";
    } catch {
      decoded = decodeWithLabel(bytes, "gb18030", false);
      encoding = "gb18030";
    }
  }

  if (looksCorrupted(decoded)) throw new ReadingImportError("decode-failed", "文件编码无法可靠识别");
  const text = decoded.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\0/g, "").trim();
  if (!text) throw new ReadingImportError("empty-file", "文件中没有可阅读的文字");
  return { text, encoding };
}

async function sha256Hex(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new ReadingImportError("hash-unavailable", "当前环境无法计算文件哈希");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const titleFromFileName = (name: string): string => {
  const title = name.replace(/\.(?:txt|md|markdown)$/i, "").trim();
  return title || "未命名小说";
};

export async function prepareReadingImport(file: ReadingImportFile): Promise<PreparedReadingImport> {
  const format = detectReadingBookFormat(file);
  const { text, encoding } = decodeReadingText(await file.arrayBuffer());
  return {
    format,
    title: titleFromFileName(file.name),
    text,
    sourceEncoding: encoding,
    sourceFileName: file.name,
    sourceMimeType: file.type || (format === "markdown" ? "text/markdown" : "text/plain"),
    sourceByteLength: file.size,
    contentHash: await sha256Hex(text),
    characterCount: [...text].filter((character) => !/\s/u.test(character)).length,
  };
}

export async function importReadingFile(
  file: ReadingImportFile,
  userIdentityId: string,
  options: {
    duplicateStrategy?: "reject" | "keep-both";
    dependencies?: ReadingImportDependencies;
  } = {},
): Promise<ReadingImportResult> {
  if (!userIdentityId.trim()) throw new ReadingImportError("metadata-write-failed", "缺少当前用户身份");
  const dependencies = options.dependencies || defaultDependencies;
  const prepared = await prepareReadingImport(file);
  const loaded = dependencies.loadStore();
  if (!loaded.valid) {
    throw new ReadingImportError("metadata-write-failed", "阅读元数据当前不可用，已停止导入以保护现有数据");
  }
  const current = loaded.value;
  const duplicates = current.books.filter((book) =>
    book.userIdentityId === userIdentityId && book.contentHash === prepared.contentHash);
  if (duplicates.length > 0 && options.duplicateStrategy !== "keep-both") {
    return { status: "duplicate", existingBookIds: duplicates.map((book) => book.id), prepared };
  }

  const now = dependencies.now();
  const bookId = dependencies.createId("book");
  const assetId = dependencies.createId("reading-asset");
  let parsed: Awaited<ReturnType<typeof parseReadingDocument>>;
  try {
    parsed = await parseReadingDocument({ text: prepared.text, format: prepared.format, userIdentityId, bookId });
  } catch (error) {
    throw new ReadingImportError("parse-failed", error instanceof Error ? error.message : "章节解析失败");
  }
  const canonicalBlob = new Blob([prepared.text], { type: "text/plain;charset=utf-8" });
  const book: ReadingBook = {
    id: bookId,
    userIdentityId,
    assetId,
    contentHash: prepared.contentHash,
    format: prepared.format,
    status: "ready",
    title: prepared.title,
    sourceFileName: prepared.sourceFileName,
    sourceMimeType: prepared.sourceMimeType,
    sourceEncoding: prepared.sourceEncoding,
    byteLength: prepared.sourceByteLength,
    wordCount: prepared.characterCount,
    chapterCount: parsed.chapters.length,
    createdAt: now,
    updatedAt: now,
  };
  const asset: ReadingBookAsset = {
    assetId,
    userIdentityId,
    bookId,
    contentHash: prepared.contentHash,
    mimeType: canonicalBlob.type,
    byteLength: canonicalBlob.size,
    blob: canonicalBlob,
    createdAt: now,
  };

  try {
    await dependencies.assetStore.save(asset);
  } catch (error) {
    throw new ReadingImportError("asset-write-failed", error instanceof Error ? error.message : "小说正文保存失败");
  }

  const write = dependencies.saveStore({
    ...current,
    books: [...current.books, book],
    chapters: [...current.chapters, ...parsed.chapters],
    paragraphAnchors: [...current.paragraphAnchors, ...parsed.paragraphAnchors],
  });
  if (!write.success) {
    await dependencies.assetStore.delete(assetId, userIdentityId, bookId).catch(() => false);
    throw new ReadingImportError("metadata-write-failed", `小说元数据保存失败：${write.error || "unknown"}`);
  }
  return { status: "imported", book };
}
