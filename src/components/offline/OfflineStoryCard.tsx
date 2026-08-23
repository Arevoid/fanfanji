import { useRef, type Key, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
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

function renderStoryMarkup(content: string): ReactNode[] {
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

export function OfflineStoryCard({ message, character, settings, showAvatars, menuOpen, onMenuToggle, onEdit, onDelete, onGuidance, onRegenerate }: OfflineStoryCardProps) {
  const isUser = message.sender === "user";
  const authorName = isUser ? settings.name || "我" : character.remark || character.name;
  const avatar = isUser ? settings.avatar : character.avatar;
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <article className={`offline-story-card ${isUser ? "is-user" : "is-character"}`}>
      <header className="offline-story-card-header">
        <div className="offline-story-author">
          {showAvatars && avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="offline-author-placeholder" />}
          <div><strong>{authorName}</strong><span>{formatTime(message.timestamp)}</span></div>
        </div>
      </header>
      <div className="offline-raw-content">{renderStoryMarkup(message.content)}</div>
      <footer className="offline-story-card-footer">
        <div className="offline-node-menu-anchor">
          <button ref={menuTriggerRef} type="button" className="offline-node-trigger" onClick={onMenuToggle} aria-label="打开剧情节点菜单"><MoreHorizontal size={20} /></button>
          {menuOpen && <OfflineNodeMenu anchorRef={menuTriggerRef} onEdit={onEdit} onDelete={onDelete} onGuidance={onGuidance} onRegenerate={isUser ? undefined : onRegenerate} onClose={onMenuToggle} />}
        </div>
      </footer>
    </article>
  );
}
