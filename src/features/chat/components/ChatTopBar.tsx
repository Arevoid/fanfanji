import type { ReactNode } from "react";

interface ChatTopBarProps {
  title: ReactNode;
  leftAction: ReactNode;
  rightAction: ReactNode;
}

export function ChatTopBar({ title, leftAction, rightAction }: ChatTopBarProps) {
  return (
    <div className="px-4 py-1.5 bg-transparent sticky top-0 z-10 flex items-center justify-between relative">
      {leftAction}
      <h2 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">{title}</h2>
      {rightAction}
    </div>
  );
}
