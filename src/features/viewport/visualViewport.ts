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
  let lastMetrics: VisualViewportMetrics | null = null;

  const readMetrics = () => getVisualViewportMetrics({
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    visualViewport: window.visualViewport,
  });

  const metricsEqual = (left: VisualViewportMetrics, right: VisualViewportMetrics) => (
    left.appViewportHeight === right.appViewportHeight
    && left.appViewportOffsetTop === right.appViewportOffsetTop
    && left.keyboardInset === right.keyboardInset
  );

  const applyMetrics = () => {
    frame = null;
    const metrics = readMetrics();
    if (lastMetrics && metricsEqual(lastMetrics, metrics)) return;
    lastMetrics = metrics;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--app-viewport-height", `${metrics.appViewportHeight}px`);
    rootStyle.setProperty("--app-viewport-offset-top", `${metrics.appViewportOffsetTop}px`);
    rootStyle.setProperty("--keyboard-inset", `${metrics.keyboardInset}px`);
    // Keep the legacy variable in sync while existing app shells migrate to the
    // shared viewport contract.
    rootStyle.setProperty("--app-height", `${metrics.appViewportHeight}px`);
    window.dispatchEvent(new CustomEvent(VISUAL_VIEWPORT_CHANGE_EVENT, { detail: metrics }));
  };

  const scheduleUpdate = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(applyMetrics);
  };

  const start = () => {
    lastMetrics = null;
    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
  };

  const stop = () => {
    window.removeEventListener("resize", scheduleUpdate);
    window.removeEventListener("orientationchange", scheduleUpdate);
    window.visualViewport?.removeEventListener("resize", scheduleUpdate);
    window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastMetrics = null;
  };

  return { start, stop, scheduleUpdate, readMetrics };
}
