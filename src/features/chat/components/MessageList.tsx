import type { CSSProperties, ReactNode, RefObject } from "react";
import type { Message } from "../../../types";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: readonly Message[];
  scrollRef: RefObject<HTMLDivElement | null>;
  className: string;
  style: CSSProperties;
  renderMessage: (message: Message, index: number) => ReactNode;
  children: ReactNode;
}

export function MessageList({ messages, scrollRef, className, style, renderMessage, children }: MessageListProps) {
  return (
    <div ref={scrollRef} className={className} style={style}>
      {messages.map((message, index) => <MessageItem key={message.id} message={message} index={index} render={renderMessage} />)}
      {children}
    </div>
  );
}
