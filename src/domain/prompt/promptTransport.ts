export interface TransportHistoryEntry {
  role?: string;
  text?: string;
  content?: string;
}

const FINAL_LANGUAGE_MARKER = "[FINAL OUTPUT LANGUAGE — HIGHEST PRIORITY]";

const splitFinalLanguageInstruction = (systemInstruction?: string) => {
  const instruction = systemInstruction?.trim() || "";
  const markerIndex = instruction.lastIndexOf(FINAL_LANGUAGE_MARKER);
  if (markerIndex < 0) return { baseSystemInstruction: instruction, finalLanguageInstruction: "" };
  return {
    baseSystemInstruction: instruction.slice(0, markerIndex).trim(),
    finalLanguageInstruction: instruction.slice(markerIndex).trim(),
  };
};

export function prepareGeminiPromptTransport(
  history: readonly TransportHistoryEntry[] | undefined,
  systemInstruction?: string,
) {
  const dialogueHistory: TransportHistoryEntry[] = [];
  const insertedSystemContext: string[] = [];
  for (const entry of history || []) {
    const text = (entry.text || entry.content || "").trim();
    if (!text) continue;
    if (entry.role === "system") insertedSystemContext.push(text);
    else dialogueHistory.push(entry);
  }
  const { baseSystemInstruction, finalLanguageInstruction } = splitFinalLanguageInstruction(systemInstruction);
  const systemParts = [baseSystemInstruction];
  if (insertedSystemContext.length > 0) {
    systemParts.push(`[Depth-scoped World Book context / 指定深度世界书背景]\n${insertedSystemContext.join("\n\n")}`);
  }
  if (finalLanguageInstruction) systemParts.push(finalLanguageInstruction);
  return {
    history: dialogueHistory,
    systemInstruction: systemParts.filter(Boolean).join("\n\n---\n\n") || undefined,
  };
}

export function prepareOpenAiPromptTransport(
  history: readonly TransportHistoryEntry[] | undefined,
  systemInstruction?: string,
) {
  const { baseSystemInstruction, finalLanguageInstruction } = splitFinalLanguageInstruction(systemInstruction);
  return {
    history: [...(history || [])],
    systemInstruction: baseSystemInstruction || undefined,
    finalSystemInstruction: finalLanguageInstruction || undefined,
  };
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
  // Gemini conversation history supports user/model turns only. System
  // entries must be lifted into systemInstruction by prepareGeminiPromptTransport.
  if (entry.role === "system") return null;
  return { role: entry.role === "user" ? ("user" as const) : ("model" as const), text: rawText };
}
