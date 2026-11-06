import type { HTMLAttributes, ReactNode } from "react";

interface AttachmentMenuProps extends HTMLAttributes<HTMLDivElement> {
  id?: string;
  role?: string;
  className: string;
  children: ReactNode;
}

export function AttachmentMenu({ className, children, ...props }: AttachmentMenuProps) {
  return <div className={`${className} chat-tools`} {...props}>{children}</div>;
}
