import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import { ArrowUp, Plus, Send } from "lucide-react";
import ChatIcon from "./ChatIcon";

interface ChatComposerProps {
  value: string;
  placeholder: string;
  isTyping: boolean;
  isFloatingCute: boolean;
  isAttachPanelOpen: boolean;
  plusIcon?: string;
  sendIcon?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus: (event: FocusEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSendOnly: () => void;
  onAttachButtonClick: () => void;
}

/** Presentational chat input form. Attachment-panel business state remains in AppChat. */
export default function ChatComposer({
  value, placeholder, isTyping, isFloatingCute, isAttachPanelOpen, plusIcon, sendIcon,
  onChange, onFocus, onSubmit, onSendOnly, onAttachButtonClick,
}: ChatComposerProps) {
  return (
    <form onSubmit={onSubmit} className="px-3 py-2 flex items-center gap-2 chat-composer__form">
      <button type="button" onClick={onAttachButtonClick} className={`w-10 h-10 rounded-full border border-slate-300 transition-all shrink-0 flex items-center justify-center cv-func-btn toggle-tools-btn chat-action-btn chat-composer__attach-button text-slate-700 ${isAttachPanelOpen ? "bg-stone-100 rotate-45" : "bg-white hover:bg-slate-100"}`} title="附件菜单">
        <span className="cv-plus-icon flex items-center justify-center w-full h-full"><ChatIcon src={plusIcon} className="w-3.5 h-3.5"><Plus className="w-3.5 h-3.5" /></ChatIcon></span>
      </button>
      <input type="text" value={value} onChange={onChange} onFocus={onFocus} placeholder={placeholder} className={`flex-1 h-10 border focus:outline-none rounded-[8px] px-4 text-xs text-slate-800 chat-input chat-composer__input ${isFloatingCute ? "bg-white/60 border-slate-200/40 focus:bg-white" : "bg-slate-50 border-slate-200/80"}`} />
      <button type="button" onClick={onSendOnly} disabled={!value.trim() || isTyping} className="w-10 h-10 rounded-full bg-slate-300 hover:bg-slate-400 disabled:opacity-40 text-white transition-all flex items-center justify-center shrink-0 shadow-sm cv-send-only-btn chat-composer__send-only-button" title="仅发送消息（不立即得到回复）">
        <span className="cv-send-only-icon flex items-center justify-center w-full h-full"><ArrowUp className="w-4 h-4 stroke-[2.5]" /></span>
      </button>
      <button type="submit" disabled={isTyping} className="w-10 h-10 rounded-full bg-slate-900 hover:bg-black disabled:opacity-40 text-white transition-all flex items-center justify-center shrink-0 shadow-sm send-button chat-composer__send-button" title="发送消息并获取回复">
        <span className="cv-send-reply-icon flex items-center justify-center w-full h-full"><ChatIcon src={sendIcon} className="w-3.5 h-3.5"><Send className="w-3.5 h-3.5 fill-white text-white" /></ChatIcon></span>
      </button>
    </form>
  );
}
