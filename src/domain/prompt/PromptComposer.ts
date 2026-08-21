import { recordPromptDebugSnapshot } from "./promptDebugRegistry";
import type { ComposedPrompt, PromptContext } from "./promptTypes";

type HistoryInjectionDiagnostic = {
  id: string;
  sourceId?: string;
  requestedDepth: number;
  insertionIndex: number;
};

const injectHistory = (context: PromptContext) => {
  const history: ComposedPrompt["history"] = [];
  const diagnostics: HistoryInjectionDiagnostic[] = [];
  const groups = new Map<number, Array<{ requestedDepth: number; injection: NonNullable<PromptContext["historyInjections"]>[number] }>>();

  for (const injection of context.historyInjections || []) {
    if (!injection.content.trim()) continue;
    const requestedDepth = Math.max(1, Math.floor(injection.depth));
    const insertionIndex = Math.max(0, context.history.length - requestedDepth);
    groups.set(insertionIndex, [...(groups.get(insertionIndex) || []), { requestedDepth, injection }]);
  }

  for (let originalIndex = 0; originalIndex <= context.history.length; originalIndex += 1) {
    const ordered = [...(groups.get(originalIndex) || [])].sort((left, right) => left.injection.id.localeCompare(right.injection.id));
    for (const { requestedDepth, injection } of ordered) {
      const insertionIndex = history.length;
      history.push({ role: "system", text: `[World Book at history depth ${requestedDepth} / 世界书指定深度]\n${injection.content.trim()}` });
      diagnostics.push({ id: injection.id, ...(injection.sourceId ? { sourceId: injection.sourceId } : {}), requestedDepth, insertionIndex });
    }
    if (originalIndex < context.history.length) history.push({ ...context.history[originalIndex] });
  }
  return { history, diagnostics };
};

/** Pure boundary between feature prompt builders and the AI client. */
export class PromptComposer {
  static compose(context: PromptContext): ComposedPrompt {
    const injected = injectHistory(context);
    const composed = {
      message: context.message,
      history: injected.history,
      systemInstruction: context.systemInstruction,
      ...(context.imageDataUrl ? { imageDataUrl: context.imageDataUrl } : {}),
    };
    recordPromptDebugSnapshot({
      scenario: context.scenario,
      ...composed,
      historyInjections: injected.diagnostics,
    });
    return composed;
  }
}
