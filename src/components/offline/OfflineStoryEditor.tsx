import { X } from "lucide-react";
import { Character, Message, UserSettings } from "../../types";

type OfflineStoryEditorProps = {
  message: Message;
  character: Character;
  settings: UserSettings;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function OfflineStoryEditor({ message, character, settings, value, onChange, onCancel, onSave }: OfflineStoryEditorProps) {
  const isUser = message.sender === "user";
  const name = isUser ? settings.name || "我" : character.remark || character.name;
  const avatar = isUser ? settings.avatar : character.avatar;

  return (
    <div className="offline-editor-backdrop" role="presentation">
      <section className="offline-editor-page" role="dialog" aria-modal="true" aria-label="编辑剧情文字">
        <header className="offline-editor-header">
          <div><h2>编辑剧情</h2><p>仅修改当前剧情文字</p></div>
          <button type="button" className="offline-icon-button" onClick={onCancel} aria-label="关闭编辑"><X size={20} /></button>
        </header>
        <div className="offline-editor-content">
          <div className="offline-editor-author">
            {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span />}
            <div><strong>{name}</strong><small>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>
          </div>
          <textarea value={value} onChange={(event) => onChange(event.target.value)} autoFocus aria-label="剧情文字编辑器" />
        </div>
        <footer className="offline-editor-footer">
          <button type="button" onClick={onCancel}>取消</button>
          <button type="button" className="offline-primary-button" onClick={onSave}>保存修改</button>
        </footer>
      </section>
    </div>
  );
}
