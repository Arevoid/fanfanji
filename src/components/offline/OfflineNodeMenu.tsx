import type { RefObject } from "react";
import { MessageSquareText, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { PopoverMenu } from "../../components/ui";

type OfflineNodeMenuProps = {
  onEdit: () => void;
  onDelete: () => void;
  onGuidance: () => void;
  onRegenerate?: () => void;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
};

export function OfflineNodeMenu({ onEdit, onDelete, onGuidance, onRegenerate, onClose, anchorRef }: OfflineNodeMenuProps) {
  return (
    <PopoverMenu open onClose={onClose} anchorRef={anchorRef} placement="bottom-end" ariaLabel="剧情节点菜单" className="offline-node-menu">
      <button type="button" onClick={onEdit} role="menuitem"><Pencil size={16} />编辑剧情文字</button>
      <button type="button" onClick={onGuidance} role="menuitem"><MessageSquareText size={16} />场外指导</button>
      {onRegenerate && <button type="button" onClick={onRegenerate} role="menuitem"><RotateCcw size={16} />重回信息</button>}
      <button type="button" className="is-danger" onClick={onDelete} role="menuitem"><Trash2 size={16} />删除当前节点</button>
    </PopoverMenu>
  );
}
