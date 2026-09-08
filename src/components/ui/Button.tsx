import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  loadingLabel?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

const variantClassName: Record<ButtonVariant, string> = {
  primary: "border border-transparent bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] hover:bg-[var(--button-primary-hover-bg)]",
  secondary: "border border-[var(--button-secondary-border)] bg-[var(--button-secondary-bg)] text-[var(--button-secondary-text)] hover:bg-[var(--surface-muted)]",
  danger: "border border-transparent bg-[var(--danger)] text-[var(--text-inverse)] hover:brightness-95",
  ghost: "border border-transparent bg-transparent text-[var(--button-ghost-text)] hover:bg-[var(--button-ghost-hover-bg)]",
};

const sizeClassName: Record<ButtonSize, string> = {
  sm: "h-[var(--control-height-sm)] px-3 text-[13px]",
  md: "h-[var(--control-height-md)] px-4 text-sm",
  lg: "h-[var(--control-height-lg)] px-5 text-[15px]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  loadingLabel = "加载中",
  disabled,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold leading-5 transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:pointer-events-none disabled:border-[var(--button-disabled-border)] disabled:bg-[var(--button-disabled-bg)] disabled:text-[var(--button-disabled-text)] disabled:opacity-100 ${variantClassName[variant]} ${sizeClassName[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-[var(--radius-full)] border-2 border-current border-t-transparent" aria-hidden="true" />}
      {loading ? loadingLabel : children}
    </button>
  );
}
