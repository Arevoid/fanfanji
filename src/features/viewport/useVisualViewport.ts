import { useEffect } from "react";
import { createVisualViewportController } from "./visualViewport";

/** Mount once at the application root to keep all input surfaces in one viewport contract. */
export function useVisualViewport() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const controller = createVisualViewportController({
      window,
      document,
      requestAnimationFrame: window.requestAnimationFrame.bind(window),
      cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    });
    controller.start();
    return () => controller.stop();
  }, []);
}
