import type { ReactNode } from "react";

interface AttachmentMenuProps {
  className: string;
  children: ReactNode;
}

export function AttachmentMenu({ className, children }: AttachmentMenuProps) {
  return <div className={className}>{children}</div>;
}
