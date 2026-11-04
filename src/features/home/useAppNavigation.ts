import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { iconSurfaceTransform, iconSurfaceClip, type SurfaceRect } from "./appTransitionGeometry";
import { appTransitionFrames } from "./appTransitionFrames";

/** Presentation only: app components and generation controllers keep their own lifetime. */
export function useAppNavigation() {
  const [activeApp, setActive] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const phoneScreenRef = useRef<HTMLDivElement>(null);
  const active = useRef<string | null>(null);
  const origin = useRef<{ app: string; element: HTMLElement; rect: SurfaceRect } | null>(null);
  const animations = useRef<Animation[]>([]);
  const clearIconFlight = useRef<(() => void) | null>(null);
  const epoch = useRef(0);
  const closing = useRef(false);
  const stopAnimations = () => {
    animations.current.forEach(animation => animation.cancel()); animations.current = [];
    clearIconFlight.current?.(); clearIconFlight.current = null;
  };
  const surface = (id: string) => phoneScreenRef.current?.querySelector<HTMLElement>(`[data-app-surface="${id === "chat" ? "chat" : "other"}"]`);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = (element: HTMLElement, frames: Keyframe[], duration: number) => {
    if (!element.animate) return Promise.resolve();
    const animation = element.animate(frames, { duration, easing: "cubic-bezier(.22,.8,.25,1)", fill: "both" });
    animations.current.push(animation);
    // Completion must remain possible when an animation is cancelled or the page is suspended.
    return Promise.race([animation.finished.catch(() => undefined), new Promise(resolve => setTimeout(resolve, duration + 100))]);
  };
  const iconShape = (element: HTMLElement, node: HTMLElement) => {
    const icon = element.getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { transform: iconSurfaceTransform(icon, bounds), clip: iconSurfaceClip(icon, bounds,
      [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]) };
  };
  const handoffIcon = (element: HTMLElement, direction: "open" | "close", duration: number) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const clone = element.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true"); clone.inert = true;
    clone.dataset.appIconFlight = "true";
    Object.assign(clone.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", zIndex: "2147483646",
      pointerEvents: "none", visibility: "visible", transform: "none", opacity: direction === "open" ? "1" : "0",
      background: style.background, borderRadius: style.borderRadius, boxShadow: style.boxShadow, color: style.color });
    const visibility = element.style.visibility;
    element.style.visibility = "hidden";
    document.body.appendChild(clone);
    clearIconFlight.current = () => { clone.remove(); element.style.visibility = visibility; };
    // Only exchange icon/page content while the visible surface is already small.
    void animate(clone, direction === "open"
      ? [{ opacity: 1, offset: 0 }, { opacity: 0, offset: .22 }, { opacity: 0, offset: 1 }]
      : [{ opacity: 0, offset: 0 }, { opacity: 0, offset: .78 }, { opacity: 1, offset: 1 }], duration);
  };
  const setActiveApp = (next: string | null) => {
    if (next === active.current || (next === null && closing.current)) return;
    const id = ++epoch.current;
    if (next !== null) {
      stopAnimations(); closing.current = false; setTransitioning(true);
      origin.current = null; active.current = next; setActive(next); return;
    }
    const current = active.current;
    const node = current && surface(current);
    const source = origin.current;
    const from = node ? getComputedStyle(node).transform : "none";
    const fromClip = node ? getComputedStyle(node).clipPath : undefined;
    stopAnimations(); closing.current = true; setTransitioning(true);
    const shape = node && source?.app === current && source.element.isConnected
      ? iconShape(source.element, node) : null;
    const minimal = reduced();
    const { frames, duration } = appTransitionFrames({ direction: "close", iconTransform: shape?.transform || null, iconClip: shape?.clip, reduced: minimal, fromTransform: from, fromClip: fromClip === "none" ? undefined : fromClip });
    if (shape?.transform && !minimal && source) handoffIcon(source.element, "close", duration);
    const done = node ? animate(node, frames, duration) : Promise.resolve();
    void done.then(() => {
      if (epoch.current !== id) return;
      // Keep the filled end frame until React has hidden the outgoing surface.
      // Cancelling first restores its full-screen base styles for one paint.
      active.current = null;
      flushSync(() => { setActive(null); setTransitioning(false); });
      stopAnimations(); closing.current = false; origin.current = null;
      if (source?.element.isConnected) {
        const target = source.element.closest<HTMLElement>("button,[tabindex]") || source.element.parentElement;
        target?.focus({ preventScroll: true });
      }
    });
  };
  const openFromIcon = (id: string, element: HTMLElement) => {
    if (closing.current || transitioning || active.current) return;
    const icon = element.matches(".app-icon-surface") ? element : element.querySelector<HTMLElement>(".app-icon-surface") || element;
    const rect = icon.getBoundingClientRect();
    setActiveApp(id);
    origin.current = { app: id, element: icon, rect: {left:rect.left, top:rect.top, width:rect.width, height:rect.height} };
  };
  useLayoutEffect(() => {
    if (!activeApp) return;
    const id = epoch.current;
    const node = surface(activeApp);
    if (!node) { setTransitioning(false); return; }
    const source = origin.current?.app === activeApp ? origin.current : null;
    const shape = source?.element.isConnected ? iconShape(source.element, node) : null;
    const minimal = reduced();
    const { frames, duration } = appTransitionFrames({ direction: "open", iconTransform: shape?.transform || null, iconClip: shape?.clip, reduced: minimal });
    if (shape?.transform && !minimal && source) handoffIcon(source.element, "open", duration);
    const done = animate(node, frames, duration);
    void done.then(() => { if (epoch.current === id) { stopAnimations(); setTransitioning(false); } });
    // Navigation uses a synchronous ref so rapid consecutive events cannot race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeApp]);
  useLayoutEffect(() => () => { epoch.current++; stopAnimations(); }, []);
  return { activeApp, setActiveApp, openFromIcon, phoneScreenRef, transitioning };
}
