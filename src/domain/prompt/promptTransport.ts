export interface TransportHistoryEntry {
  role?: string;
  text?: string;
  content?: string;
}

export function toOpenAiHistoryEntry(entry: TransportHistoryEntry) {
  return {
    role: entry.role === "system" ? "system" : entry.role === "user" ? "user" : "assistant",
    content: entry.text || entry.content || "",
  } as const;
}

export function toGeminiHistoryEntry(entry: TransportHistoryEntry) {
  const rawText = (entry.text || entry.content || "").trim();
  if (!rawText) return null;
  if (entry.role === "system") {
    return {
      role: "user" as const,
      text: `[System context inserted in conversation history / 插入聊天历史的系统上下文]\n${rawText}`,
    };
  }
  return { role: entry.role === "user" ? ("user" as const) : ("model" as const), text: rawText };
}
