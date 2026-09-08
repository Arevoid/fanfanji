import type { HTMLAttributes, ReactNode } from "react";

export type CardVariant = "default" | "secondary" | "outlined" | "interactive";
export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  className?: string;
}

const variantClassName: Record<CardVariant, string> = {
  default: "bg-[var(--color-surface)] shadow-[var(--shadow-sm)]",
  secondary: "bg-[var(--color-surface-secondary)]",
  outlined: "bg-[var(--color-surface)] border border-[var(--color-border)]",
  interactive: "bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] transition-[background-color,transform] duration-200 hover:bg-[var(--color-surface-secondary)]",
};

const paddingClassName: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-[var(--space-3)]",
  md: "p-[var(--space-4)]",
  lg: "p-[var(--space-5)]",
};

export function Card({ variant = "default", padding = "md", className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] ${variantClassName[variant]} ${paddingClassName[padding]} ${className}`}
      {...props}
    />
  );
}
