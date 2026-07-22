import type { ReactNode } from "react";

interface ChatComposerProps {
  className: string;
  quotePreview?: ReactNode;
  children: ReactNode;
}

export function ChatComposer({ className, quotePreview, children }: ChatComposerProps) {
  return <div className={className}>{quotePreview}{children}</div>;
}
