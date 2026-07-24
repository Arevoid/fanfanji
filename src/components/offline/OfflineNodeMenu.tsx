import { MessageSquareText, Pencil, Trash2, X } from "lucide-react";

type OfflineNodeMenuProps = {
  onEdit: () => void;
  onDelete: () => void;
  onGuidance: () => void;
  onClose: () => void;
};

export function OfflineNodeMenu({ onEdit, onDelete, onGuidance, onClose }: OfflineNodeMenuProps) {
  return (
    <div className="offline-node-menu" role="menu" aria-label="剧情节点菜单">
      <button type="button" onClick={onEdit} role="menuitem"><Pencil size={16} />编辑剧情文字</button>
      <button type="button" onClick={onGuidance} role="menuitem"><MessageSquareText size={16} />场外指导</button>
      <button type="button" className="is-danger" onClick={onDelete} role="menuitem"><Trash2 size={16} />删除当前节点</button>
      <button type="button" className="offline-node-menu-close" onClick={onClose} aria-label="关闭菜单"><X size={15} /></button>
    </div>
  );
}
