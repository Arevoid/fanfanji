import { Button, Modal, Textarea } from "../../components/ui";

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
    <Modal
      open
      title="场外指导"
      description="为接下来的故事节点提供方向。"
      onClose={onClose}
      ariaLabel="场外指导"
      className="offline-guidance-modal"
      contentClassName="offline-guidance-content"
      footer={<><Button variant="secondary" fullWidth onClick={onClose}>取消</Button><Button fullWidth onClick={() => onSave(oneTime, ongoing)}>保存指导</Button></>}
    >
      <label>
        <span>临时指导 <em>一次有效</em></span>
        <Textarea defaultValue={initialOneTime} placeholder="下一段希望：角色主动关心我，但是不要表现得太明显。" onChange={(event) => { oneTime = event.target.value; }} />
      </label>
      <label>
        <span>长期指导 <em>持续参考</em></span>
        <Textarea defaultValue={initialOngoing} placeholder={"剧情规则：\n- 感情发展慢一点\n- 保持现实感\n- 不突然出现陌生人物"} onChange={(event) => { ongoing = event.target.value; }} />
      </label>
      <p className="offline-guidance-note">本版本仅提供场外指导界面与本次页面草稿，不改变当前 AI 生成规则。</p>
    </Modal>
  );
}
