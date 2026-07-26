import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonVariant = "ghost" | "surface" | "danger";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: ReactNode;
  variant?: IconButtonVariant;
  className?: string;
  type?: "button" | "submit" | "reset";
}

const variantClassName: Record<IconButtonVariant, string> = {
  ghost: "bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]",
  surface: "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:brightness-95",
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
      className={`inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] shrink-0 items-center justify-center rounded-[var(--radius-full)] transition-[background-color,color,opacity,transform] duration-150 disabled:pointer-events-none disabled:opacity-45 ${variantClassName[variant]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
}
