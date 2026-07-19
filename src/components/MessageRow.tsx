import { useState, type ReactNode } from "react";

export interface MessageRowData {
  id: string;
  visualType: string;
  layout: "side" | "stacked";
  isConsecutive: boolean;
  shouldCollapse: boolean;
  showAvatar: boolean;
  showNickname: boolean;
}

export interface MessageRowAvatar {
  src: string;
  name: string;
  className: string;
  onClick?: () => void;
}

interface MessageRowProps {
  message: MessageRowData;
  isSelf: boolean;
  avatar: MessageRowAvatar;
  children: ReactNode;
}

function MessageAvatar({ avatar }: { avatar: MessageRowAvatar }) {
  const [failed, setFailed] = useState(false);
  const isEmoji = !avatar.src || (!avatar.src.startsWith("http") && !avatar.src.startsWith("data:") && !avatar.src.startsWith("/") && !avatar.src.startsWith("."));

  if (failed || isEmoji) {
    const cleanName = (avatar.name || "👤").replace(/[\s\p{Emoji}\p{Extended_Pictographic}]+/gu, "").trim();
    const firstChar = cleanName ? cleanName.charAt(0) : (avatar.name ? avatar.name.charAt(0) : "👤");
    const colors = [
      "bg-rose-100 text-rose-700 border-rose-200", "bg-blue-100 text-blue-700 border-blue-200",
      "bg-amber-100 text-amber-700 border-amber-200", "bg-emerald-100 text-emerald-700 border-emerald-200",
      "bg-indigo-100 text-indigo-700 border-indigo-200", "bg-violet-100 text-violet-700 border-violet-200",
      "bg-teal-100 text-teal-700 border-teal-200", "bg-slate-100 text-slate-700 border-slate-200",
    ];
    let hash = 0;
    for (let i = 0; i < avatar.name.length; i++) hash = avatar.name.charCodeAt(i) + ((hash << 5) - hash);
    const colorClass = colors[Math.abs(hash) % colors.length];
    return (
      <div onClick={avatar.onClick} className={`${avatar.className} flex items-center justify-center font-bold text-sm border select-none cursor-pointer overflow-hidden ${colorClass}`}>
        {isEmoji && avatar.src ? <span className="text-lg leading-none">{avatar.src}</span> : <span className="text-[13px] tracking-tight">{firstChar}</span>}
      </div>
    );
  }

  return <img src={avatar.src} alt="" onError={() => setFailed(true)} onClick={avatar.onClick} className={avatar.className} />;
}

/** Presentation-only message frame; message contents and interactions stay in AppChat. */
export default function MessageRow({ message, isSelf, avatar, children }: MessageRowProps) {
  const rowSpacing = message.isConsecutive && message.shouldCollapse ? "mt-1.5" : "mt-4.5";
  const sender = isSelf ? "self" : "other";
  const rowClass = `chat-message chat-message--${sender} chat-message--${message.visualType} ${rowSpacing} cv-msg-row message message-container`;

  if (message.layout === "stacked") {
    return (
      <div className={`w-full flex flex-col ${isSelf ? "items-end" : "items-start"} ${rowClass}`} data-sender={sender} data-message-type={message.visualType}>
        {message.showAvatar && (
          <div className={`flex items-center gap-2.5 mb-1.5 select-none ${isSelf ? "flex-row-reverse" : "flex-row"}`}>
            <MessageAvatar avatar={avatar} />
            <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"} text-[10px] text-slate-500/80 space-y-0.5 msg-meta-header`}>
              {message.showNickname && !isSelf && (
                <div className="flex items-center gap-1 font-bold text-slate-700/85 tracking-wider uppercase msg-meta-name"><span>🖤</span><span>{avatar.name}</span></div>
              )}
            </div>
          </div>
        )}
        <div className="max-w-[85%] chat-message__bubble-container">{children}</div>
      </div>
    );
  }

  return (
    <div className={`w-full flex gap-2.5 ${isSelf ? "flex-row-reverse items-start justify-start" : "flex-row items-start justify-start"} ${rowClass}`} data-sender={sender} data-message-type={message.visualType}>
      {message.showAvatar ? <MessageAvatar avatar={avatar} /> : <div className="w-9 h-9 shrink-0" />}
      <div className={`flex flex-col max-w-[80%] ${isSelf ? "items-end" : "items-start"}`}>
        {message.showAvatar && message.showNickname && !isSelf && (
          <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"} text-[10px] text-slate-500/80 mb-1 space-y-0.5 msg-meta-header`}>
            <div className="flex items-center gap-1 font-bold text-slate-700/85 tracking-wider uppercase msg-meta-name"><span>🖤</span><span>{avatar.name}</span></div>
          </div>
        )}
        <div className="max-w-full chat-message__bubble-container">{children}</div>
      </div>
    </div>
  );
}
