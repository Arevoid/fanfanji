import { useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal, Settings } from "lucide-react";
import type { OfflineStory } from "../../../types";
import { PopoverMenu } from "../../../components/ui";

interface OfflineWorkspaceHeaderProps {
  story: OfflineStory;
  characterName: string;
  onExit: () => void;
  onOpenReadingSettings: () => void;
  onOpenStorySettings: () => void;
}

/** Presentation-only header for the active offline story workspace. */
export function OfflineWorkspaceHeader({
  story,
  characterName,
  onExit,
  onOpenReadingSettings,
  onOpenStorySettings,
}: OfflineWorkspaceHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="offline-workspace-header">
      <div className="offline-workspace-nav">
        <button type="button" onClick={onExit} aria-label="返回线下故事列表" className="offline-icon-button offline-workspace-back">
          <ArrowLeft size={18} />
        </button>
        <div className="offline-workspace-title">
          <h1>
            <span className="offline-workspace-title-text">{story.title}</span>
            <span className="offline-mode-label">{story.mode === "director" ? "导演" : story.mode === "if" ? "IF线" : "续写"}</span>
          </h1>
          <p>与「{characterName}」的离线剧本空间</p>
        </div>
        <div className="offline-workspace-menu-anchor">
          <button ref={triggerRef} type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="打开线下剧情菜单" className="offline-icon-button">
            <MoreHorizontal size={18} />
          </button>
          <PopoverMenu open={menuOpen} onClose={closeMenu} anchorRef={triggerRef} placement="bottom-end" ariaLabel="线下剧情菜单" className="offline-workspace-menu">
            <button type="button" role="menuitem" onClick={() => { closeMenu(); onOpenReadingSettings(); }}>
              <span className="offline-workspace-menu-icon" aria-hidden="true">Aa</span><span>阅读设置</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { closeMenu(); onOpenStorySettings(); }}>
              <Settings size={16} /><span>剧本设置</span>
            </button>
          </PopoverMenu>
        </div>
      </div>
    </header>
  );
}
