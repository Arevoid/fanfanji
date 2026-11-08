import { useRef, type Key, type ReactNode } from "react";
import { ArrowLeftRight, FileText, Gift, MapPin, Mic, MoreHorizontal, Music2, Sparkles } from "lucide-react";
import { Character, Message, UserSettings } from "../../types";
import { OfflineNodeMenu } from "./OfflineNodeMenu";

type OfflineStoryCardProps = {
  key?: Key;
  message: Message;
  character: Character;
  settings: UserSettings;
  showAvatars: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGuidance: () => void;
  onRegenerate?: () => void;
};

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function HighlightedStoryText({ content }: { content: string; key?: Key }) {
  const parts = content.split(/(“[^”]*”|「[^」]*」|『[^』]*』)/g);
  return parts.map((part, index) => /^(“[^”]*”|「[^」]*」|『[^』]*』)$/.test(part)
    ? <span className="offline-dialogue-highlight" key={index}>{part}</span>
    : <span key={index}>{part}</span>);
}

function renderNarrativeMarkup(content: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  const detailsPattern = /<details([^>]*)>[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = detailsPattern.exec(content))) {
    const before = content.slice(cursor, match.index).replace(/<\/?(?:details|summary)[^>]*>/gi, "");
    if (before) blocks.push(<HighlightedStoryText key={`text-${index++}`} content={before} />);
    const attributes = match[1] || "";
    blocks.push(
      <details key={`details-${index++}`} className="offline-story-details" open={/\bopen(?:\s*=\s*["']?open["']?)?/i.test(attributes)}>
        <summary>{match[2].trim() || "展开内容"}</summary>
        <div className="offline-story-details-content"><HighlightedStoryText content={match[3].replace(/<\/?(?:details|summary)[^>]*>/gi, "").trim()} /></div>
      </details>,
    );
    cursor = match.index + match[0].length;
  }
  const after = content.slice(cursor).replace(/<\/?(?:details|summary)[^>]*>/gi, "");
  if (after) blocks.push(<HighlightedStoryText key={`text-${index}`} content={after} />);
  return blocks;
}

function decodeActionValue(value: string | undefined): string {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

function renderOfflineActionMarkup(markup: string, key: string): ReactNode {
  const [kind, first = "", second = "", third = ""] = markup.split("|");
  if (kind === "[红包]") {
    return <div key={key} className="offline-story-action-card offline-story-action-card--red-packet" role="group" aria-label="角色发送了红包">
      <Gift size={22} aria-hidden="true" /><div><strong>红包 ¥{first || "8.88"}</strong><span>{second || "恭喜发财，万事如意"}</span></div>
    </div>;
  }
  if (kind === "[转账]") {
    return <div key={key} className="offline-story-action-card offline-story-action-card--transfer" role="group" aria-label="角色发起了转账">
      <ArrowLeftRight size={22} aria-hidden="true" /><div><strong>转账 ¥{first || "0.00"}</strong><span>{second || "转账"}{third === "true" ? " · 已确认" : ""}</span></div>
    </div>;
  }
  if (kind === "[位置]") {
    return <div key={key} className="offline-story-action-card" role="group" aria-label="角色发送了位置"><MapPin size={22} aria-hidden="true" /><div><strong>位置</strong><span>{first || "未命名位置"}</span></div></div>;
  }
  if (kind === "[文件]") {
    return <div key={key} className="offline-story-action-card" role="group" aria-label="角色发送了文件"><FileText size={22} aria-hidden="true" /><div><strong>{first || "文件"}</strong><span>{decodeActionValue(second) || "角色分享的文件"}</span></div></div>;
  }
  if (kind === "[音乐]") {
    return <div key={key} className="offline-story-action-card" role="group" aria-label="角色分享了音乐"><Music2 size={22} aria-hidden="true" /><div><strong>{first || "音乐"}</strong><span>{second || "未知艺术家"}</span></div></div>;
  }
  if (kind === "[语音]") {
    return <div key={key} className="offline-story-action-card" role="group" aria-label="角色发送了语音"><Mic size={22} aria-hidden="true" /><div><strong>语音消息</strong><span>{first || "1"} 秒 · {second || ""}</span></div></div>;
  }
  if (kind === "[表情]") {
    return <div key={key} className="offline-story-action-card" role="group" aria-label="角色发送了表情"><Sparkles size={22} aria-hidden="true" /><div><strong>{first || "表情"}</strong><span>{decodeActionValue(third) || "角色发送的表情"}</span></div></div>;
  }
  return null;
}

function renderStoryMarkup(content: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  const actionPattern = /(?:^|\n)(\[(?:红包|转账|位置|文件|音乐|语音|表情)\]\|[^\n]*)/g;
  let cursor = 0;
  let actionIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = actionPattern.exec(content))) {
    const before = content.slice(cursor, match.index).replace(/^\n+|\n+$/g, "");
    if (before) blocks.push(...renderNarrativeMarkup(before));
    const action = renderOfflineActionMarkup(match[1], `offline-action-${actionIndex++}`);
    if (action) blocks.push(action);
    cursor = match.index + match[0].length;
  }
  const after = content.slice(cursor).replace(/^\n+|\n+$/g, "");
  if (after) blocks.push(...renderNarrativeMarkup(after));
  return blocks;
}

export function OfflineStoryCard({ message, character, settings, showAvatars, menuOpen, onMenuToggle, onEdit, onDelete, onGuidance, onRegenerate }: OfflineStoryCardProps) {
  const isUser = message.sender === "user";
  const authorName = isUser ? settings.name || "我" : character.remark || character.name;
  const avatar = isUser ? settings.avatar : character.avatar;
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <article className={`offline-story-card ${isUser ? "is-user offline-story-card--user" : "is-character offline-story-card--character"}`}>
      <header className="offline-story-card-header">
        <div className="offline-story-author">
          {showAvatars && avatar ? <img className="offline-story-author-avatar" src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="offline-author-placeholder offline-story-author-avatar" />}
          <div className="offline-story-author-copy"><strong>{authorName}</strong><span className="offline-story-card-time">{formatTime(message.timestamp)}</span></div>
        </div>
      </header>
      <div className="offline-story-card-content offline-raw-content">{renderStoryMarkup(message.content)}</div>
      <footer className="offline-story-card-footer">
        <div className="offline-story-card-actions offline-node-menu-anchor">
          <button ref={menuTriggerRef} type="button" className="offline-node-trigger" onClick={onMenuToggle} aria-label="打开剧情节点菜单"><MoreHorizontal size={20} /></button>
          {menuOpen && <OfflineNodeMenu anchorRef={menuTriggerRef} onEdit={onEdit} onDelete={onDelete} onGuidance={onGuidance} onRegenerate={isUser ? undefined : onRegenerate} onClose={onMenuToggle} />}
        </div>
      </footer>
    </article>
  );
}
