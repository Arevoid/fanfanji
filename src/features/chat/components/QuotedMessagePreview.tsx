import type { ReactNode } from "react";
import type { Message } from "../../../types";
import { formatMessageContentForQuote } from "../services/messageParser";

interface QuotedMessagePreviewProps {
  message: Message;
  senderName: string;
  onClear: () => void;
  closeIcon: ReactNode;
}

export interface ParsedQuoteReply {
  author: string;
  content: string;
  body: string;
}

/** Parses the existing serialized quote prefix for display only. */
export function parseQuoteReply(content: string): ParsedQuoteReply | null {
  const match = content.match(/^「引用\s+([^：]+)：([\s\S]*?)」\n([\s\S]*)$/);
  if (!match) return null;
  return { author: match[1], content: match[2], body: match[3] };
}

export function QuotedMessagePreview({ message, senderName, onClear, closeIcon }: QuotedMessagePreviewProps) {
  const summary = formatMessageContentForQuote(message.content);

  return (
    <div className="composer-quote-preview message-quote px-3 py-1.5 border-b border-stone-100 flex items-center justify-between text-[11px] shrink-0 animate-fade-in">
      <div className="message-quote__content truncate flex-1 pr-4 pl-2 py-1 text-left">
        <span className="message-quote__author font-extrabold">{message.sender === "user" ? "自己" : senderName}: </span>
        <span className="italic">{summary}</span>
      </div>
      <button type="button" onClick={onClear} className="text-stone-400 hover:text-stone-600 p-0.5">{closeIcon}</button>
    </div>
  );
}
