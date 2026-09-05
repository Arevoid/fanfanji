import { useRef, useState } from "react";

/** Owns transient editor state, memory-sync coordination and the persistence queue. */
export function useOfflineStoryRuntimeState() {
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const memorySyncInFlightRef = useRef(new Set<string>());
  const [memorySyncingStoryId, setMemorySyncingStoryId] = useState<string | null>(null);
  const storyPersistenceRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const workspaceEndRef = useRef<HTMLDivElement | null>(null);

  return {
    inputText,
    setInputText,
    isGenerating,
    setIsGenerating,
    errorMsg,
    setErrorMsg,
    memorySyncInFlightRef,
    memorySyncingStoryId,
    setMemorySyncingStoryId,
    storyPersistenceRef,
    workspaceScrollRef,
    workspaceEndRef,
  };
}
