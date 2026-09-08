import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

type BubbleTipAnchor = {
  key: string;
  side: "self" | "other";
  left: number;
  top: number;
  height: number;
  backgroundColor: string;
};

export function BubbleTipPortalLayer({ enabled }: { enabled: boolean }) {
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const [anchors, setAnchors] = useState<BubbleTipAnchor[]>([]);

  useLayoutEffect(() => {
    if (!enabled) {
      setAnchors([]);
      return;
    }
    const root = document.getElementById("conv-screen");
    if (!root) return;
    let frame = 0;
    const updatePositions = () => {
      frame = 0;
      const next: BubbleTipAnchor[] = [];
      root.querySelectorAll<HTMLElement>(".chat-bubble-self.msg-group-top, .chat-bubble-other.msg-group-top").forEach((bubble, index) => {
        if (bubble.closest(".cv-bubble-tip-portal-layer")) return;
        const rect = bubble.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const side = bubble.classList.contains("chat-bubble-self") ? "self" : "other";
        next.push({
          key: `${side}-${index}`,
          side,
          left: side === "self" ? rect.right : rect.left,
          top: rect.top,
          height: rect.height,
          backgroundColor: window.getComputedStyle(bubble).backgroundColor,
        });
      });
      setAnchors((previous) => previous.length === next.length && previous.every((item, index) => {
        const candidate = next[index];
        return item.key === candidate.key
          && item.side === candidate.side
          && item.backgroundColor === candidate.backgroundColor
          && Math.abs(item.left - candidate.left) < 0.5
          && Math.abs(item.top - candidate.top) < 0.5
          && Math.abs(item.height - candidate.height) < 0.5;
      }) ? previous : next);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updatePositions);
    };
    scheduleUpdate();
    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [enabled]);

  return <div ref={(node) => { if (node !== portalHost) setPortalHost(node); }} className="cv-bubble-tip-portal-layer" aria-hidden="true">
    {portalHost && anchors.map((anchor) => createPortal(
      <div key={anchor.key} className="cv-bubble-tip-portal" style={{ left: anchor.left, top: anchor.top, width: 0, height: anchor.height }}><div className={`bubble-tip ${anchor.side}-tip`} style={{ "--bubble-tip-bg": anchor.backgroundColor } as React.CSSProperties} /></div>,
      portalHost,
      anchor.key,
    ))}
  </div>;
}
