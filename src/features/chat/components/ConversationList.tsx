import type { ReactNode } from "react";
import { MessageSquare, Pin } from "lucide-react";
import type { Character, Message } from "../../../types";

export interface ConversationThread {
  id: string;
  character: Character;
  lastMessage: Message | null;
  isPinned: boolean;
  subtitle?: string;
}

interface ConversationListProps {
  header: ReactNode;
  threads: readonly ConversationThread[];
  onSelect: (characterId: string) => void;
  getUnreadCount: (characterId: string) => number;
  renderAvatar: (character: Character) => ReactNode;
  getGroupMessageSummary: (message: Message) => string;
}

export function ConversationList({
  header,
  threads,
  onSelect,
  getUnreadCount,
  renderAvatar,
  getGroupMessageSummary,
}: ConversationListProps) {
  return (
    <div className="divide-y divide-[var(--divider)] bg-[var(--surface)] text-[var(--text-primary)]">
      {header}
      {threads.length === 0 ? (
        <div className="text-center py-20 px-4">
          <div className="w-12 h-12 bg-[var(--surface-muted)] rounded-full flex items-center justify-center text-[var(--text-tertiary)] mx-auto mb-3">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h4 className="text-xs font-bold text-[var(--text-primary)]">暂无任何对话</h4>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1 max-w-xs mx-auto leading-relaxed">
            您还没有开始任何聊天。请前往底部的“通讯录”，选择一位档案馆中的虚拟伙伴发起首条对话！
          </p>
        </div>
      ) : (
        threads.map(({ id, character, lastMessage, isPinned, subtitle }) => {
          const unreadCount = getUnreadCount(id);
          return (
            <div
              key={id}
              onClick={() => onSelect(id)}
              className={`flex items-center p-3 cursor-pointer transition-colors relative ${
                isPinned ? "bg-[var(--surface-selected)] hover:brightness-95" : "hover:bg-[var(--surface-muted)]"
              }`}
            >
              {isPinned && <Pin className="w-3 h-3 text-[var(--accent)] absolute top-2 right-2 rotate-45 opacity-60" />}
              <div className="relative shrink-0 mr-3">
                {renderAvatar(character)}
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-[var(--danger)] text-[var(--text-inverse)] text-[10px] font-bold rounded-full flex items-center justify-center px-1 border border-[var(--surface)] shadow-sm">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {character.remark || character.name}
                    {subtitle && <span className="text-[var(--text-tertiary)] font-normal ml-1">· {subtitle}</span>}
                    {character.isGroupChat && <span className="text-[var(--text-tertiary)] font-normal ml-1">({1 + (character.memberIds?.length || 0)})</span>}
                  </h4>
                  {lastMessage && <span className="text-[9px] text-[var(--text-tertiary)] font-medium">{new Date(lastMessage.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5 leading-normal">
                  {lastMessage ? (character.isGroupChat ? getGroupMessageSummary(lastMessage) : lastMessage.content) : ""}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
