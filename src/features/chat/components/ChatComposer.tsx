import { useState, type ReactNode } from "react";
import type { FormEvent } from "react";
import { ArrowUp, Plus, Send, Square } from "lucide-react";
import ChatIcon from "../../../components/ChatIcon";
import { ChatTextInput } from "./ChatTextInput";

interface ChatComposerProps {
  className: string;
  quotePreview?: ReactNode;
  children: ReactNode;
}

export function ChatComposer({ className, quotePreview, children }: ChatComposerProps) {
  return <div className={className}>{quotePreview}{children}</div>;
}

interface ChatInputBarProps {
  placeholder: string;
  isTyping: boolean;
  isReplyInFlight: boolean;
  isOfflineMode: boolean;
  showAttachPanel: boolean;
  onToggleAttach: () => void;
  onSendOnly: (inputText: string, event?: FormEvent) => void | Promise<void>;
  onSendAndReply: (inputText: string, event?: FormEvent) => void | Promise<void>;
  onStopReply: () => void;
  getChatIcon: (key: "plus" | "sendOnly" | "sendReply" | "stop") => string | undefined;
}

/**
 * Owns the rapidly-changing input state so typing does not re-render the
 * whole AppChat tree and all of its message-derived views.
 */
export function ChatInputBar({
  placeholder,
  isTyping,
  isReplyInFlight,
  isOfflineMode,
  showAttachPanel,
  onToggleAttach,
  onSendOnly,
  onSendAndReply,
  onStopReply,
  getChatIcon,
}: ChatInputBarProps) {
  const [inputText, setInputText] = useState("");
  const hasText = inputText.trim().length > 0;

  const submitOnly = (event?: FormEvent) => {
    if (event) event.preventDefault();
    void onSendOnly(inputText, event);
    setInputText("");
  };

  const submitAndReply = (event?: FormEvent) => {
    if (isReplyInFlight) {
      event?.preventDefault();
      onStopReply();
      return;
    }
    void onSendAndReply(inputText, event);
    setInputText("");
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitOnly(event);
      }}
      className="w-full min-w-0 max-w-full box-border px-3 py-2 flex items-center gap-2 chat-composer__form"
    >
      <button
        type="button"
        onClick={onToggleAttach}
        className={`w-10 h-10 transition-all shrink-0 flex items-center justify-center cv-func-btn toggle-tools-btn chat-action-btn chat-composer__button chat-composer__attach-button ${showAttachPanel ? "chat-composer__button--open rotate-45" : "chat-composer__button--idle"}`}
        title="附加菜单"
      >
        <span className="cv-plus-icon flex items-center justify-center w-full h-full">
          <ChatIcon src={getChatIcon("plus")} className="w-3.5 h-3.5"><Plus className="w-3.5 h-3.5" /></ChatIcon>
        </span>
      </button>

      {isOfflineMode ? (
        <textarea
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          placeholder={placeholder}
          rows={1}
          className="min-w-0 w-0 flex-1 min-h-10 max-h-24 resize-none overflow-y-auto px-4 py-2 text-xs leading-5 chat-input chat-composer__input"
        />
      ) : (
        <ChatTextInput
          type="text"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 w-0 flex-1 h-10 px-4 text-xs chat-input chat-composer__input"
        />
      )}

      <button
        type="button"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => submitOnly()}
        disabled={!hasText || isTyping}
        className="w-10 h-10 transition-all flex items-center justify-center shrink-0 cv-send-only-btn chat-composer__button chat-composer__send-only-button chat-composer__send-button"
        title="仅发送消息 (不立即得到回复)"
      >
        <span className="cv-send-only-icon flex items-center justify-center w-full h-full">
          <ChatIcon src={getChatIcon("sendOnly")} className="w-4 h-4"><ArrowUp className="w-4 h-4 stroke-[2.5]" /></ChatIcon>
        </span>
      </button>

      <button
        type="button"
        onClick={() => submitAndReply()}
        disabled={!isReplyInFlight && isTyping}
        className={`w-10 h-10 transition-all flex items-center justify-center shrink-0 send-button chat-composer__button chat-composer__send-reply-button chat-composer__send-button ${isReplyInFlight ? "chat-composer__stop-reply-button" : ""}`}
        title={isReplyInFlight ? "停止生成回复" : "发送消息并获取回复"}
      >
        <span className="cv-send-reply-icon flex items-center justify-center w-full h-full">
          {isReplyInFlight
            ? <span className="cv-stop-icon flex items-center justify-center w-full h-full"><ChatIcon src={getChatIcon("stop")} className="w-3.5 h-3.5"><Square className="w-3.5 h-3.5 fill-current text-current" /></ChatIcon></span>
            : <ChatIcon src={getChatIcon("sendReply")} className="w-3.5 h-3.5"><Send className="w-3.5 h-3.5 fill-current text-current" /></ChatIcon>}
        </span>
      </button>
    </form>
  );
}
