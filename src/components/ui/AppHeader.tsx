import type { HTMLAttributes, ReactNode } from "react";

export type AppHeaderVariant = "default" | "compact";

export interface AppHeaderProps extends HTMLAttributes<HTMLElement> {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  variant?: AppHeaderVariant;
  className?: string;
}

/** Page-agnostic top navigation shell. Actions are supplied by the caller. */
export function AppHeader({
  title,
  subtitle,
  left,
  right,
  variant = "default",
  className = "",
  ...props
}: AppHeaderProps) {
  const compact = variant === "compact";
  return (
    <header
      className={`relative z-[var(--z-header)] flex h-[var(--nav-height)] items-center gap-[var(--space-3)] px-[var(--page-padding)] text-[var(--color-text-primary)] ${className}`}
      {...props}
    >
      <div className="flex w-[var(--control-height-md)] shrink-0 items-center justify-start">{left}</div>
      <div className="min-w-0 flex-1 text-center">
        <div className={`${compact ? "text-[15px]" : "text-[17px]"} truncate font-semibold leading-6`}>{title}</div>
        {!compact && subtitle && <div className="mt-1 truncate text-xs leading-4 text-[var(--color-text-secondary)]">{subtitle}</div>}
      </div>
      <div className="flex w-[var(--control-height-md)] shrink-0 items-center justify-end">{right}</div>
    </header>
  );
}
