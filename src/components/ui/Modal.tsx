import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { useOverlayDismiss } from "./overlayUtils";

export type ModalSize = "sm" | "md";

export interface ModalProps {
  open: boolean;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  headerActions?: ReactNode;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  showCloseButton?: boolean;
  ariaLabel?: string;
  className?: string;
  contentClassName?: string;
}

const sizeClassName: Record<ModalSize, string> = {
  sm: "max-w-[320px]",
  md: "max-w-[400px]",
};

/** Centered overlay for focused editing and forms. */
export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  footer,
  headerActions,
  size = "md",
  closeOnOverlayClick = true,
  showCloseButton = true,
  ariaLabel,
  className = "",
  contentClassName = "",
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  useOverlayDismiss({ open, onClose, lockScroll: true });

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="app-viewport-overlay fixed inset-x-0 top-0 z-[var(--z-modal)] flex items-center justify-center bg-[var(--color-overlay)] px-[var(--space-4)]"
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
            className={`flex w-[90vw] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-[var(--shadow-modal)] ${sizeClassName[size]} ${className}`}
            style={{ maxHeight: "min(60vh, calc(var(--app-viewport-height, 100dvh) - env(safe-area-inset-top) - env(safe-area-inset-bottom)))" }}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {(title || description || showCloseButton) && (
              <header className="flex shrink-0 items-center gap-[var(--space-3)] px-[var(--space-5)] pt-[var(--space-5)]">
                <div className="min-w-0 flex-1">
                  {title && <h2 id={titleId} className="text-[17px] font-semibold leading-6">{title}</h2>}
                  {description && <p id={descriptionId} className="mt-1 text-[13px] leading-[18px] text-[var(--color-text-secondary)]">{description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {headerActions}
                  {showCloseButton && <IconButton aria-label="关闭" icon={<X size={20} />} onClick={onClose} variant="ghost" />}
                </div>
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
