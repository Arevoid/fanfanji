import { useEffect } from "react";

let scrollLockCount = 0;
let originalBodyOverflow = "";

interface OverlayDismissOptions {
  open: boolean;
  onClose: () => void;
  lockScroll?: boolean;
}

/** Shared escape and scroll-lock behavior for presentation-only overlays. */
export function useOverlayDismiss({ open, onClose, lockScroll = false }: OverlayDismissOptions) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    if (lockScroll) {
      if (scrollLockCount === 0) {
        originalBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      }
      scrollLockCount += 1;
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (lockScroll) {
        scrollLockCount = Math.max(0, scrollLockCount - 1);
        if (scrollLockCount === 0) document.body.style.overflow = originalBodyOverflow;
      }
    };
  }, [lockScroll, onClose, open]);
}
