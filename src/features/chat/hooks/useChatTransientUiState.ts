import { useState } from "react";

/** Owns AppChat-only transient inputs and notices; no persistence or I/O. */
export function useChatTransientUiState() {
  const [manualLocationText, setManualLocationText] = useState("");
  const [emptyGreetingCheckedCharIds, setEmptyGreetingCheckedCharIds] = useState<string[]>([]);
  const [sentGreetings, setSentGreetings] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [memoNotes, setMemoNotes] = useState<any[]>([]);

  return {
    manualLocationText,
    setManualLocationText,
    emptyGreetingCheckedCharIds,
    setEmptyGreetingCheckedCharIds,
    sentGreetings,
    setSentGreetings,
    toastMessage,
    setToastMessage,
    memoNotes,
    setMemoNotes,
  };
}
