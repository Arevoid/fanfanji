import { X } from "lucide-react";

type OfflineGuidancePanelProps = {
  onClose: () => void;
  onSave: (oneTime: string, ongoing: string) => void;
  initialOneTime?: string;
  initialOngoing?: string;
};

export function OfflineGuidancePanel({ onClose, onSave, initialOneTime = "", initialOngoing = "" }: OfflineGuidancePanelProps) {
  let oneTime = initialOneTime;
  let ongoing = initialOngoing;

  return (
    <div className="offline-guidance-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="offline-guidance-panel"
        role="dialog"
        aria-modal="true"
        aria-label="场外指导"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="offline-guidance-header">
          <div>
            <h2>场外指导</h2>
            <p>为接下来的故事节点提供方向。</p>
          </div>
          <button type="button" className="offline-icon-button" onClick={onClose} aria-label="关闭场外指导"><X size={20} /></button>
        </header>
        <div className="offline-guidance-content">
          <label>
            <span>临时指导 <em>一次有效</em></span>
            <textarea
              defaultValue={initialOneTime}
              placeholder="下一段希望：沈妄主动关心我，但是不要表现得太明显。"
              onChange={(event) => { oneTime = event.target.value; }}
            />
          </label>
          <label>
            <span>长期指导 <em>持续参考</em></span>
            <textarea
              defaultValue={initialOngoing}
              placeholder={"剧情规则：\n- 感情发展慢一点\n- 保持现实感\n- 不突然出现陌生人物"}
              onChange={(event) => { ongoing = event.target.value; }}
            />
          </label>
          <p className="offline-guidance-note">本版本仅提供场外指导界面与本次页面草稿，不改变当前 AI 生成规则。</p>
        </div>
        <footer className="offline-guidance-footer">
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="offline-primary-button" onClick={() => onSave(oneTime, ongoing)}>保存指导</button>
        </footer>
      </section>
    </div>
  );
}
