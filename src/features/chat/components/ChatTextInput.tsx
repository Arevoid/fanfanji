import type { InputHTMLAttributes } from "react";

type ChatTextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function ChatTextInput(props: ChatTextInputProps) {
  return <input {...props} />;
}
