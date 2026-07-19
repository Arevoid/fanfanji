import { ChevronLeft, MoreHorizontal } from "lucide-react";

interface ChatHeaderProps {
  name: string;
  remark?: string;
  avatar: string;
  isGroupChat?: boolean;
  memberCount?: number;
  isFloatingCute: boolean;
  onBack: () => void;
  onMore: () => void;
}

/** Presentational conversation header. State and settings behavior remain in AppChat. */
export default function ChatHeader({
  name,
  remark,
  avatar,
  isGroupChat,
  memberCount = 0,
  isFloatingCute,
  onBack,
  onMore,
}: ChatHeaderProps) {
  return (
    <div className={`flex items-center justify-between z-10 shrink-0 relative cv-header header app-top-container default-controls selection-controls chat-header ${
      isFloatingCute
        ? "mx-3.5 mt-3.5 mb-1 bg-white/70 backdrop-blur-md rounded-[28px] border border-slate-200/50 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)] px-4 py-2"
        : "px-4 py-1.5 bg-transparent"
    }`}>
      <button
        onClick={onBack}
        className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0 cv-icon-btn back-btn chat-header__back-button"
      >
        <span className="cv-back-icon flex items-center justify-center w-full h-full">
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </span>
      </button>

      <div className="flex items-center gap-1.5 w-max max-w-[200px] header-title chat-header__title">
        {isGroupChat ? (
          <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] shrink-0 header-title-avatar chat-header__avatar">
            👥
          </div>
        ) : (
          <img
            src={avatar}
            alt=""
            className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/50 header-title-avatar chat-header__avatar"
          />
        )}
        <h2 className="text-[13px] font-bold text-slate-800 tracking-tight truncate header-title-name chat-header__name">
          {remark || name}
          {isGroupChat && (
            <span className="text-slate-400 font-normal ml-0.5">
              ({1 + memberCount})
            </span>
          )}
        </h2>
        {!isGroupChat && (
          <div className="flex items-center gap-0.5 character-status chat-header__status">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-indicator online animate-pulse chat-header__status-dot" />
          </div>
        )}
      </div>

      <button
        onClick={onMore}
        className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0 cv-icon-btn menu-btn chat-header__more-button"
      >
        <span className="cv-menu-icon flex items-center justify-center w-full h-full">
          <MoreHorizontal className="w-4 h-4 text-slate-700" />
        </span>
      </button>
    </div>
  );
}
