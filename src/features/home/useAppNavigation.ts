import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { iconSurfaceTransform, type SurfaceRect } from "./appTransitionGeometry";
import { appTransitionFrames } from "./appTransitionFrames";

/** Presentation only: app components and generation controllers keep their own lifetime. */
export function useAppNavigation() {
  const [activeApp, setActive] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const phoneScreenRef = useRef<HTMLDivElement>(null);
  const active = useRef<string | null>(null);
  const origin = useRef<{ app: string; element: HTMLElement; rect: SurfaceRect } | null>(null);
  const animations = useRef<Animation[]>([]);
  const epoch = useRef(0);
  const closing = useRef(false);
  const stopAnimations = () => { animations.current.forEach(animation => animation.cancel()); animations.current = []; };
  const surface = (id: string) => phoneScreenRef.current?.querySelector<HTMLElement>(`[data-app-surface="${id === "chat" ? "chat" : "other"}"]`);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = (element: HTMLElement, frames: Keyframe[], duration: number) => {
    if (!element.animate) return Promise.resolve();
    const animation = element.animate(frames, { duration, easing: "cubic-bezier(.22,.8,.25,1)", fill: "both" });
    animations.current.push(animation);
    // Completion must remain possible when an animation is cancelled or the page is suspended.
    return Promise.race([animation.finished.catch(() => undefined), new Promise(resolve => setTimeout(resolve, duration + 100))]);
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
    stopAnimations(); closing.current = true; setTransitioning(true);
    const transform = node && source?.app === current && source.element.isConnected
      ? iconSurfaceTransform(source.element.getBoundingClientRect(), node.getBoundingClientRect()) : null;
    const minimal = reduced();
    const { frames, duration } = appTransitionFrames({ direction: "close", iconTransform: transform, reduced: minimal, fromTransform: from });
    const done = node ? animate(node, frames, duration) : Promise.resolve();
    const home = phoneScreenRef.current?.querySelector<HTMLElement>("[data-home-surface]");
    if (home && !minimal) void animate(home, [{ transform: "scale(.985)" }, {transform: "none"}], duration);
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
    const transform = origin.current?.app === activeApp ? iconSurfaceTransform(origin.current.rect, node.getBoundingClientRect()) : null;
    const minimal = reduced();
    const { frames, duration } = appTransitionFrames({ direction: "open", iconTransform: transform, reduced: minimal });
    const done = animate(node, frames, duration);
    const home = phoneScreenRef.current?.querySelector<HTMLElement>("[data-home-surface]");
    if (home && !minimal) void animate(home, [{transform: "none"}, {transform: "scale(.985)"}], duration);
    void done.then(() => { if (epoch.current === id) { stopAnimations(); setTransitioning(false); } });
    // Navigation uses a synchronous ref so rapid consecutive events cannot race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeApp]);
  useLayoutEffect(() => () => { epoch.current++; stopAnimations(); }, []);
  return { activeApp, setActiveApp, openFromIcon, phoneScreenRef, transitioning };
}
