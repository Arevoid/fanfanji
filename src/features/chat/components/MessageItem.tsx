import type { ReactNode } from "react";
import type { Message } from "../../../types";

interface MessageItemProps {
  key?: string;
  message: Message;
  index: number;
  render: (message: Message, index: number) => ReactNode;
}

/** Keeps list keying and item dispatch separate from AppChat business state. */
export function MessageItem({ message, index, render }: MessageItemProps) {
  return <>{render(message, index)}</>;
}
