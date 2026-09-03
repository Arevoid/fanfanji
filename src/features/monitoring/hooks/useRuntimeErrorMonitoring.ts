import { useEffect } from "react";
import { recordRuntimeError } from "../../../core/monitoring/runtimeErrorMetrics";

function errorName(value: unknown): string {
  if (value && typeof value === "object" && "name" in value && typeof (value as { name?: unknown }).name === "string") {
    return (value as { name: string }).name;
  }
  if (value instanceof Error && value.name) return value.name;
  return "UnknownError";
}

/** Records bounded error type counters without retaining messages, stacks, or request data. */
export function useRuntimeErrorMonitoring(): void {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleError = (event: ErrorEvent) => {
      recordRuntimeError({ source: "window-error", name: errorName(event.error) });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      recordRuntimeError({ source: "unhandled-rejection", name: errorName(event.reason) });
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
}
