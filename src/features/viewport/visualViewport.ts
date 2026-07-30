export const VISUAL_VIEWPORT_CHANGE_EVENT = "fanfanji:visual-viewport-change";

export interface ViewportSnapshot {
  innerHeight: number;
  clientHeight: number;
  visualViewport?: {
    height: number;
    offsetTop: number;
  } | null;
}

export interface VisualViewportMetrics {
  appViewportHeight: number;
  appViewportOffsetTop: number;
  keyboardInset: number;
}

const KEYBOARD_INSET_RATIO = 0.18;

export function getVisualViewportMetrics({ innerHeight, clientHeight, visualViewport }: ViewportSnapshot): VisualViewportMetrics {
  const layoutHeight = Math.max(0, innerHeight || 0, clientHeight || 0);
  const visualHeight = Math.max(0, visualViewport?.height || layoutHeight);
  const offsetTop = Math.max(0, visualViewport?.offsetTop || 0);
  const appViewportHeight = Math.round(Math.min(visualHeight || layoutHeight, layoutHeight || visualHeight));
  const rawInset = Math.max(0, layoutHeight - visualHeight - offsetTop);

  // Browser chrome can change the visual viewport by a small amount. It must still
  // resize the shell, but should not be treated as a keyboard inset.
  const keyboardInset = layoutHeight > 0 && rawInset / layoutHeight >= KEYBOARD_INSET_RATIO
    ? Math.round(rawInset)
    : 0;

  return {
    appViewportHeight,
    appViewportOffsetTop: Math.round(offsetTop),
    keyboardInset,
  };
}

export interface VisualViewportControllerEnvironment {
  window: Window;
  document: Document;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

export function createVisualViewportController(environment: VisualViewportControllerEnvironment) {
  const { window, document, requestAnimationFrame, cancelAnimationFrame } = environment;
  let frame: number | null = null;
  let focusedElement: HTMLElement | null = null;

  const readMetrics = () => getVisualViewportMetrics({
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    visualViewport: window.visualViewport,
  });

  const keepFocusedElementVisible = () => {
    const target = focusedElement;
    if (!target || !target.isConnected) return;
    const metrics = readMetrics();
    const rect = target.getBoundingClientRect();
    const visibleTop = metrics.appViewportOffsetTop;
    const visibleBottom = visibleTop + metrics.appViewportHeight;
    if (rect.top < visibleTop || rect.bottom > visibleBottom) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  const applyMetrics = () => {
    frame = null;
    const metrics = readMetrics();
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--app-viewport-height", `${metrics.appViewportHeight}px`);
    rootStyle.setProperty("--app-viewport-offset-top", `${metrics.appViewportOffsetTop}px`);
    rootStyle.setProperty("--keyboard-inset", `${metrics.keyboardInset}px`);
    // Keep the legacy variable in sync while existing app shells migrate to the
    // shared viewport contract.
    rootStyle.setProperty("--app-height", `${metrics.appViewportHeight}px`);
    window.dispatchEvent(new CustomEvent(VISUAL_VIEWPORT_CHANGE_EVENT, { detail: metrics }));
    keepFocusedElementVisible();
  };

  const scheduleUpdate = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(applyMetrics);
  };

  const handleFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches("input, textarea, select, [contenteditable='true']")) return;
    focusedElement = target;
    scheduleUpdate();
    requestAnimationFrame(() => requestAnimationFrame(keepFocusedElementVisible));
  };

  const handleFocusOut = () => {
    focusedElement = null;
  };

  const start = () => {
    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
  };

  const stop = () => {
    window.removeEventListener("resize", scheduleUpdate);
    window.removeEventListener("orientationchange", scheduleUpdate);
    window.visualViewport?.removeEventListener("resize", scheduleUpdate);
    window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    focusedElement = null;
  };

  return { start, stop, scheduleUpdate, readMetrics };
}
