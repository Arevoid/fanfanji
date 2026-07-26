import { Character, Message, UserSettings } from "../../types";
import { Button, Modal, Textarea } from "../../components/ui";

type OfflineStoryEditorProps = { message: Message; character: Character; settings: UserSettings; value: string; onChange: (value: string) => void; onCancel: () => void; onSave: () => void; };

export function OfflineStoryEditor({ message, character, settings, value, onChange, onCancel, onSave }: OfflineStoryEditorProps) {
  const isUser = message.sender === "user";
  const name = isUser ? settings.name || "我" : character.remark || character.name;
  const avatar = isUser ? settings.avatar : character.avatar;

  return (
    <Modal open title="编辑剧情" description="仅修改当前剧情文字。" onClose={onCancel} ariaLabel="编辑剧情文字" className="offline-editor-modal" contentClassName="offline-editor-content" footer={<><Button variant="secondary" fullWidth onClick={onCancel}>取消</Button><Button fullWidth onClick={onSave}>保存修改</Button></>}>
      <div className="offline-editor-author">
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span />}
        <div><strong>{name}</strong><small>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>
      </div>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} autoFocus aria-label="剧情文字编辑器" className="offline-editor-textarea" />
    </Modal>
  );
}
