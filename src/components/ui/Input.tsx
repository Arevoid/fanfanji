import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  inputClassName?: string;
  className?: string;
  disabled?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error = false, prefix, suffix, className = "", inputClassName = "", disabled, ...props },
  ref,
) {
  return (
    <div
      className={`flex h-[var(--control-height-md)] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border bg-[var(--color-surface-secondary)] px-[var(--space-3)] text-[var(--color-text-primary)] transition-[border-color,box-shadow] duration-150 ${error ? "border-[var(--color-danger)]" : "border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--color-accent)_18%,transparent)]"} ${disabled ? "cursor-not-allowed opacity-55" : ""} ${className}`}
    >
      {prefix && <span className="flex shrink-0 items-center text-[var(--color-text-secondary)]">{prefix}</span>}
      <input
        ref={ref}
        disabled={disabled}
        className={`min-w-0 flex-1 bg-transparent text-sm leading-5 outline-none placeholder:text-[var(--color-text-tertiary)] ${inputClassName}`}
        {...props}
      />
      {suffix && <span className="flex shrink-0 items-center text-[var(--color-text-secondary)]">{suffix}</span>}
    </div>
  );
});
