import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useOverlayDismiss } from "./overlayUtils";

export type PopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

export interface PopoverMenuProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  anchorRef?: RefObject<HTMLElement | null>;
  position?: { x: number; y: number };
  placement?: PopoverPlacement;
  ariaLabel?: string;
  className?: string;
}

interface PopoverPosition {
  top: number;
  left: number;
}

const VIEWPORT_GUTTER = 8;

/** A viewport-safe floating menu anchored to an element or a pointer position. */
export function PopoverMenu({
  open,
  onClose,
  children,
  anchorRef,
  position,
  placement = "bottom-start",
  ariaLabel = "操作菜单",
  className = "",
}: PopoverMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<PopoverPosition | null>(null);
  useOverlayDismiss({ open, onClose });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const updatePosition = () => {
      const menu = menuRef.current;
      const anchor = anchorRef?.current;
      if (!menu) return;
      const menuRect = menu.getBoundingClientRect();
      const anchorRect = anchor?.getBoundingClientRect();
      const source = position || (anchorRect ? { x: anchorRect.left, y: anchorRect.bottom } : null);
      if (!source) return;

      const isTop = placement.startsWith("top");
      const isEnd = placement.endsWith("end");
      const rawTop = isTop && anchorRect ? anchorRect.top - menuRect.height - VIEWPORT_GUTTER : source.y + VIEWPORT_GUTTER;
      const rawLeft = isEnd && anchorRect ? anchorRect.right - menuRect.width : source.x;
      setMenuPosition({
        top: Math.max(VIEWPORT_GUTTER, Math.min(rawTop, window.innerHeight - menuRect.height - VIEWPORT_GUTTER)),
        left: Math.max(VIEWPORT_GUTTER, Math.min(rawLeft, window.innerWidth - menuRect.width - VIEWPORT_GUTTER)),
      });
    };

    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open, placement, position]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchorRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [anchorRef, onClose, open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          className={`fixed z-[var(--z-popover)] min-w-44 max-w-[calc(100vw-16px)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-[var(--space-1)] text-[var(--color-text-primary)] shadow-[var(--shadow-modal)] ${menuPosition ? "visible" : "invisible"} ${className}`}
          style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : undefined}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.12 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
