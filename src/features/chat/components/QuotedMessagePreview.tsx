import type { ReactNode } from "react";
import type { Message } from "../../../types";

interface QuotedMessagePreviewProps {
  message: Message;
  senderName: string;
  onClear: () => void;
  closeIcon: ReactNode;
}

export function QuotedMessagePreview({ message, senderName, onClear, closeIcon }: QuotedMessagePreviewProps) {
  const summary = message.content.startsWith("[文件]")
    ? `[文件] ${message.content.split("|")[1] || "笔记"}`
    : message.content.startsWith("[")
      ? "[媒体内容]"
      : message.content;

  return (
    <div className="px-3 py-1.5 bg-stone-50 border-b border-stone-100 flex items-center justify-between text-[11px] text-stone-600 shrink-0 animate-fade-in">
      <div className="truncate flex-1 pr-4 text-left">
        <span className="font-extrabold text-stone-700">引用自 {message.sender === "user" ? "自己" : senderName}: </span>
        <span className="italic">{summary}</span>
      </div>
      <button type="button" onClick={onClear} className="text-stone-400 hover:text-stone-600 p-0.5">{closeIcon}</button>
    </div>
  );
}
