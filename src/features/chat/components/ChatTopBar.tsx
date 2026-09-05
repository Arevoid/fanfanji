import type { ReactNode } from "react";

interface ChatTopBarProps {
  title: ReactNode;
  leftAction: ReactNode;
  rightAction: ReactNode;
}

export function ChatTopBar({ title, leftAction, rightAction }: ChatTopBarProps) {
  return (
    <div className="px-4 py-1.5 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--divider)] sticky top-0 z-10 flex items-center justify-between relative text-[var(--text-primary)]">
      {leftAction}
      <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight absolute left-1/2 -translate-x-1/2 w-max">{title}</h2>
      {rightAction}
    </div>
  );
}
