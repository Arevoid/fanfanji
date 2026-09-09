export const DIRECT_CHAT_MEMORY_ADMISSION_TEST_GLOBAL = "__fanfanjiMemoryAdmissionTest" as const;

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
  persistenceMode: "observation_only";
}

export interface DirectChatMemoryAdmissionTestApi {
  extractNow: () => Promise<DirectChatMemoryAdmissionTestResult>;
}

/** The explicit trigger is installed only in a Vite development build. */
export const isDirectChatMemoryAdmissionDevRuntime = (): boolean => {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
};
