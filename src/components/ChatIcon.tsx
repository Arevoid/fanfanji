import type { ReactNode } from "react";

interface ChatIconProps {
  src?: string;
  className?: string;
  children: ReactNode;
}

/** Renders a configured icon resource, or preserves the supplied default icon. */
export default function ChatIcon({ src, className = "", children }: ChatIconProps) {
  if (!src?.trim()) return <>{children}</>;
  return <img src={src} alt="" className={`chat-configured-icon object-contain ${className}`} />;
}
