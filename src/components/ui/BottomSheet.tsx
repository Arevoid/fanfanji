import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { useOverlayDismiss } from "./overlayUtils";

export interface BottomSheetProps {
  open: boolean;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  closeOnOverlayClick?: boolean;
  showCloseButton?: boolean;
  ariaLabel?: string;
  className?: string;
  contentClassName?: string;
}

/** Bottom-aligned mobile overlay for short selections and lightweight settings. */
export function BottomSheet({
  open,
  title,
  description,
  children,
  onClose,
  footer,
  closeOnOverlayClick = true,
  showCloseButton = false,
  ariaLabel,
  className = "",
  contentClassName = "",
}: BottomSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  useOverlayDismiss({ open, onClose, lockScroll: true });

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[var(--z-sheet)] flex items-end justify-center bg-[var(--color-overlay)] px-[var(--space-4)] pb-[env(safe-area-inset-bottom)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(event) => {
            if (closeOnOverlayClick && event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            className={`flex max-h-[55vh] w-[90vw] max-w-[400px] flex-col overflow-hidden rounded-[var(--radius-sheet)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-[var(--shadow-modal)] ${className}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-[var(--space-2)] h-1 w-9 shrink-0 rounded-[var(--radius-full)] bg-[var(--color-border)]" aria-hidden="true" />
            {(title || description || showCloseButton) && (
              <header className="flex shrink-0 items-start gap-[var(--space-3)] px-[var(--space-5)] pt-[var(--space-4)]">
                <div className="min-w-0 flex-1">
                  {title && <h2 id={titleId} className="text-[17px] font-semibold leading-6">{title}</h2>}
                  {description && <p id={descriptionId} className="mt-1 text-[13px] leading-[18px] text-[var(--color-text-secondary)]">{description}</p>}
                </div>
                {showCloseButton && <IconButton aria-label="关闭" icon={<X size={20} />} onClick={onClose} variant="ghost" />}
              </header>
            )}
            <div className={`min-h-0 flex-1 overflow-y-auto px-[var(--space-5)] py-[var(--space-4)] ${contentClassName}`}>{children}</div>
            {footer && <footer className="flex shrink-0 items-center justify-end gap-[var(--space-3)] border-t border-[var(--color-border)] px-[var(--space-5)] py-[var(--space-4)]">{footer}</footer>}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
