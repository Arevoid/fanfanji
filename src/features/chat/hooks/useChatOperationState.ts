import { useState } from "react";

/** Owns only in-flight flags for user-triggered AppChat operations. */
export function useChatOperationState() {
  const [isManualArchiving, setIsManualArchiving] = useState(false);
  const [isCompressingMemory, setIsCompressingMemory] = useState(false);

  return {
    isManualArchiving,
    setIsManualArchiving,
    isCompressingMemory,
    setIsCompressingMemory,
  };
}
