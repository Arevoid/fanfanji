import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export type ConfirmDialogTone = "default" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  loading?: boolean;
}

/** A standardized confirmation dialog for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  onClose,
  onConfirm,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "default",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      )}
    >
      {children}
    </Modal>
  );
}
