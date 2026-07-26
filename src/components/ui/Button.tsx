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
  primary: "bg-[var(--color-accent)] text-white hover:brightness-95",
  secondary: "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:brightness-95",
  danger: "bg-[var(--color-danger)] text-white hover:brightness-95",
  ghost: "bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]",
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
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold leading-5 transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${variantClassName[variant]} ${sizeClassName[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-[var(--radius-full)] border-2 border-current border-t-transparent" aria-hidden="true" />}
      {loading ? loadingLabel : children}
    </button>
  );
}
