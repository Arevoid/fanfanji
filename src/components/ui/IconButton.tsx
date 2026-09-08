import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonVariant = "ghost" | "surface" | "danger";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: ReactNode;
  variant?: IconButtonVariant;
  className?: string;
  type?: "button" | "submit" | "reset";
}

const variantClassName: Record<IconButtonVariant, string> = {
  ghost: "bg-transparent text-[var(--button-ghost-text)] hover:bg-[var(--button-ghost-hover-bg)]",
  surface: "border border-[var(--button-secondary-border)] bg-[var(--button-secondary-bg)] text-[var(--button-secondary-text)] hover:bg-[var(--surface-muted)]",
  danger: "bg-transparent text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]",
};

/** A 40px square icon action with a required accessible label. */
export function IconButton({
  icon,
  variant = "ghost",
  className = "",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] shrink-0 items-center justify-center rounded-[var(--radius-full)] transition-[background-color,color,opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:pointer-events-none disabled:border-[var(--button-disabled-border)] disabled:bg-[var(--button-disabled-bg)] disabled:text-[var(--button-disabled-text)] disabled:opacity-100 ${variantClassName[variant]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
}
