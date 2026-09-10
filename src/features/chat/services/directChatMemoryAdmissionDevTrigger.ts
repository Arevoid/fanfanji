export const DIRECT_CHAT_MEMORY_ADMISSION_TEST_GLOBAL = "__fanfanjiMemoryAdmissionTest" as const;
/** Deliberately non-secret token required by the isolated local write probe. */
export const DIRECT_CHAT_MEMORY_ADMISSION_SYNTHETIC_WRITE_TOKEN = "stage4d11h-synthetic-write" as const;

export type DirectChatMemoryAdmissionTestStatus =
  | "completed"
  | "ACTIVE_DIRECT_SCOPE_UNAVAILABLE"
  | "NO_MESSAGES"
  | "FAILED";

export interface DirectChatMemoryAdmissionTestResult {
  status: DirectChatMemoryAdmissionTestStatus;
  scopeAvailable: boolean;
  messageCount: number;
  providerRequestObserved: boolean;
  candidateCount: number;
  shadowObservationCountBefore: number;
  shadowObservationCountAfter: number;
  persistenceMode: "observation_only" | "production_equivalent_write";
}

export interface DirectChatMemoryAdmissionTestApi {
  extractNow: (options?: {
    persistenceMode?: "observation_only" | "production_equivalent_write";
  }) => Promise<DirectChatMemoryAdmissionTestResult>;
  /** Dev-only, token-gated writer probe for an isolated synthetic fixture. */
  extractSyntheticCanaryWrite?: (token: string) => Promise<DirectChatMemoryAdmissionTestResult>;
}

/** The explicit trigger is installed only in a Vite development build. */
export const isDirectChatMemoryAdmissionDevRuntime = (): boolean => {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
};
