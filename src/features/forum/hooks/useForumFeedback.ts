import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/** A fresh deadline for every notification, including repeated identical failures. */
export function useForumFeedback() {
  const [feedback, setFeedback] = useState({ error: "", notice: "" });
  const current = useRef(feedback);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((key: "error" | "notice", value: SetStateAction<string>) => {
    const message = typeof value === "function" ? value(current.current[key]) : value;
    if (!message && !current.current[key]) return;
    if (timer.current !== null) clearTimeout(timer.current);
    current.current = message ? { error: "", notice: "", [key]: message } : { ...current.current, [key]: "" };
    setFeedback(current.current);
    timer.current = message ? setTimeout(() => {
      current.current = { error: "", notice: "" };
      setFeedback(current.current);
      timer.current = null;
    }, 4000) : null;
  }, []);
  const setError: Dispatch<SetStateAction<string>> = useCallback(value => update("error", value), [update]);
  const setNotice: Dispatch<SetStateAction<string>> = useCallback(value => update("notice", value), [update]);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  return { ...feedback, setError, setNotice };
}
