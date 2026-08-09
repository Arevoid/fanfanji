import type { PromptHistoryEntry, PromptScenario } from "./promptTypes";

export interface PromptDebugSnapshot {
  id: string;
  createdAt: number;
  scenario: PromptScenario;
  message: string;
  history: PromptHistoryEntry[];
  systemInstruction: string;
  historyInjections: Array<{ id: string; sourceId?: string; requestedDepth: number; insertionIndex: number }>;
}

type NewPromptDebugSnapshot = Omit<PromptDebugSnapshot, "id" | "createdAt">;
type Listener = () => void;
const MAX_SNAPSHOTS = 20;
let snapshots: PromptDebugSnapshot[] = [];
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((listener) => listener());

export function recordPromptDebugSnapshot(input: NewPromptDebugSnapshot): void {
  snapshots = [...snapshots, {
    ...input,
    id: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    history: input.history.map((entry) => ({ ...entry })),
    historyInjections: input.historyInjections.map((entry) => ({ ...entry })),
  }].slice(-MAX_SNAPSHOTS);
  notify();
}

export function listPromptDebugSnapshots(): PromptDebugSnapshot[] {
  return snapshots.map((snapshot) => ({
    ...snapshot,
    history: snapshot.history.map((entry) => ({ ...entry })),
    historyInjections: snapshot.historyInjections.map((entry) => ({ ...entry })),
  }));
}

export function clearPromptDebugSnapshots(): void {
  snapshots = [];
  notify();
}

export function subscribePromptDebugSnapshots(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
