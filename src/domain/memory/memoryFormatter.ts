import type { MemoryItem } from "../../types";
import { sanitizeOfflineMemoryForOnlineUse } from "./offlineMemorySync";

export function formatMemoriesForPrompt(memories: readonly MemoryItem[], prefix: string): string {
  if (memories.length === 0) return "";
  return `${prefix}${memories.map((memory) => `  * ${sanitizeOfflineMemoryForOnlineUse(memory.content)}`).join("\n")}`;
}

export function formatExtractedMemorySummary(header: string, items: readonly string[]): string {
  return `${header}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

export function formatDelicateMemoryDiary(header: string, items: readonly string[]): string {
  return `${header}\n${items.join("\n\n")}`;
}
