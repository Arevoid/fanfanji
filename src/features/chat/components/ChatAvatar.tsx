import { useState } from "react";

export interface ChatAvatarProps {
  src: string;
  alt: string;
  name: string;
  className: string;
  onClick?: () => void;
}

export function ChatAvatar({ src, alt, name, className, onClick }: ChatAvatarProps) {
  const [failed, setFailed] = useState(false);
  const isEmoji = !src || (!src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("/") && !src.startsWith("."));

  if (failed || isEmoji) {
    const cleanName = (name || "👤").replace(/[\s\p{Emoji}\p{Extended_Pictographic}]+/gu, "").trim();
    const firstChar = cleanName ? cleanName.charAt(0) : (name ? name.charAt(0) : "👤");
    const colors = [
      "bg-rose-100 text-rose-700 border-rose-200",
      "bg-blue-100 text-blue-700 border-blue-200",
      "bg-amber-100 text-amber-700 border-amber-200",
      "bg-emerald-100 text-emerald-700 border-emerald-200",
      "bg-indigo-100 text-indigo-700 border-indigo-200",
      "bg-violet-100 text-violet-700 border-violet-200",
      "bg-teal-100 text-teal-700 border-teal-200",
      "bg-slate-100 text-slate-700 border-slate-200",
    ];
    let hash = 0;
    for (let index = 0; index < (name || "").length; index += 1) {
      hash = (name || "").charCodeAt(index) + ((hash << 5) - hash);
    }
    const colorClass = colors[Math.abs(hash) % colors.length];

    return (
      <div onClick={onClick} className={`${className} flex items-center justify-center font-bold text-sm border select-none cursor-pointer overflow-hidden ${colorClass}`}>
        {isEmoji && src
          ? <span className="text-lg leading-none">{src}</span>
          : <span className="text-[13px] tracking-tight">{firstChar}</span>}
      </div>
    );
  }

  return <img src={src} alt={alt} onError={() => setFailed(true)} onClick={onClick} className={className} />;
}
