import { useEffect, useRef } from "react";

/** Observe the actual memory scroll container, including after a filter reset. */
export function MemoryAutoLoad({ count, total, onLoad }: { count: number; total: number; onLoad: () => void }) {
  const target = useRef<HTMLDivElement>(null);
  const load = useRef(onLoad);
  load.current = onLoad;
  useEffect(() => {
    const element = target.current;
    if (!element || count >= total) return;
    let requested = false;
    let cancelled = false;
    const observer = new IntersectionObserver(entries => {
      if (cancelled || requested || !entries.some(entry => entry.isIntersecting)) return;
      requested = true;
      observer.disconnect();
      load.current();
    }, { root: element.closest("[data-memory-scroll]"), rootMargin: "0px 0px 160px 0px" });
    observer.observe(element);
    return () => { cancelled = true; observer.disconnect(); };
  }, [count, total]);
  return count < total ? <div ref={target} role="status" className="memory-auto-load">正在加载更多记忆…</div> : null;
}
