import { forwardRef, useImperativeHandle, useRef, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  autoResize?: boolean;
  className?: string;
  disabled?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error = false, autoResize = false, className = "", disabled, onChange, ...props },
  forwardedRef,
) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => localRef.current as HTMLTextAreaElement);

  const resize = (element: HTMLTextAreaElement) => {
    if (!autoResize) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  return (
    <textarea
      ref={localRef}
      disabled={disabled}
      onChange={(event) => {
        resize(event.currentTarget);
        onChange?.(event);
      }}
      className={`min-h-[96px] w-full resize-y rounded-[var(--radius-sm)] border bg-[var(--input-bg)] px-[var(--space-3)] py-[var(--space-2)] text-sm leading-5 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--input-placeholder)] transition-[border-color,box-shadow] duration-150 ${error ? "border-[var(--color-danger)]" : "border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--focus-ring)]"} ${disabled ? "cursor-not-allowed opacity-55" : ""} ${className}`}
      {...props}
    />
  );
});
