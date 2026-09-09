import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import type { CharacterTruthScope } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { MemoryItem } from "../../../types";
import type {
  DirectChatMemoryShadowComparison,
} from "./directChatMemoryShadowComparison";

export interface DirectChatMemoryShadowRealReport {
  capturedAt: number;
  scope: CharacterTruthScope;
  production: {
    selectedCount: number;
    selectedByKind: Record<string, number>;
    estimatedChars: number;
  };
  shadow: {
    selectedCount: number;
    selectedByKind: Record<string, number>;
    estimatedChars: number;
  };
  comparison: DirectChatMemoryShadowComparison;
}

export interface DirectChatMemoryShadowDebugConfiguration {
  enabled: boolean;
  /** Explicit test/debug injection may enable collection outside a dev build. */
  explicitDebug?: boolean;
  maxReports?: number;
}

export interface DirectChatMemoryShadowInput {
  memories?: readonly MemoryItem[];
  events?: readonly CharacterEvent[];
  maxItems?: number;
  maxCharacters?: number;
}

interface DirectChatMemoryShadowContributorOption {
  enabled: boolean;
  memories?: readonly MemoryItem[];
  events?: readonly CharacterEvent[];
  maxItems?: number;
  maxCharacters?: number;
  onReport?: (input: { scope: CharacterTruthScope; comparison: DirectChatMemoryShadowComparison }) => void;
}

const DEFAULT_MAX_REPORTS = 20;
const MAX_REPORTS = 50;
let configured = false;
let maxReports = DEFAULT_MAX_REPORTS;
let recentReports: DirectChatMemoryShadowRealReport[] = [];

const isDevBuild = (): boolean => {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
};

const clampMaxReports = (value: number | undefined): number => Math.max(1, Math.min(MAX_REPORTS, Math.floor(value ?? DEFAULT_MAX_REPORTS)));

/** Explicitly configure the in-memory collector. It never creates storage or network side effects. */
export function configureDirectChatMemoryShadowDiagnostics(configuration: DirectChatMemoryShadowDebugConfiguration): void {
  configured = configuration.enabled && (configuration.explicitDebug === true || isDevBuild());
  maxReports = clampMaxReports(configuration.maxReports);
  if (!configured) recentReports = [];
}

export function clearDirectChatMemoryShadowReports(): void {
  recentReports = [];
}

export function getRecentDirectChatMemoryShadowReports(): DirectChatMemoryShadowRealReport[] {
  return recentReports.slice();
}

export function drainDirectChatMemoryShadowReports(): DirectChatMemoryShadowRealReport[] {
  const reports = recentReports.slice();
  recentReports = [];
  return reports;
}

const appendReport = (scope: CharacterTruthScope, comparison: DirectChatMemoryShadowComparison): void => {
  if (!configured) return;
  const report: DirectChatMemoryShadowRealReport = {
    capturedAt: Date.now(),
    scope: { ...scope },
    production: {
      selectedCount: comparison.productionSelectedCount,
      selectedByKind: { ...comparison.productionSelectedByKind },
      estimatedChars: comparison.productionEstimatedCharacters,
    },
    shadow: {
      selectedCount: comparison.shadowSelectedCount,
      selectedByKind: { ...comparison.shadowDiagnostics.selectedByKind },
      estimatedChars: comparison.shadowEstimatedCharacters,
    },
    comparison,
  };
  recentReports = [...recentReports, report].slice(-maxReports);
};

/**
 * Returns the contributor option for the already-loaded normal Direct Chat
 * material. Disabled means undefined before any source array is inspected.
 */
export function getDirectChatMemoryShadowDiagnosticsInput(
  input: DirectChatMemoryShadowInput = {},
): DirectChatMemoryShadowContributorOption | undefined {
  if (!configured) return undefined;
  return {
    enabled: true,
    memories: input.memories,
    events: input.events,
    maxItems: input.maxItems,
    maxCharacters: input.maxCharacters,
    onReport: ({ scope, comparison }) => {
      try {
        appendReport(scope, comparison);
      } catch {
        // Diagnostics are strictly best-effort; production chat must continue.
      }
    },
  };
}
