import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  title?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  ariaLabel?: string;
}

/** Focused centered overlay used by chat detail actions without page navigation. */
export function Modal({ open, title, children, onClose, footer, ariaLabel }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === "string" ? title : undefined)}
        className="flex max-h-[min(60vh,560px)] w-[90vw] max-w-[400px] flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white text-slate-800 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          {title && <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-6">{title}</h2>}
          <button type="button" aria-label="关闭" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">{footer}</footer>}
      </section>
    </div>
  );
}
