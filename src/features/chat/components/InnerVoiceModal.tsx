import type { Character, InnerVoiceRecord } from "../../../types";
import { Button, Card, Modal } from "../../../components/ui";
import { ChatAvatar as RenderAvatar } from "./ChatAvatar";
import { RefreshCw } from "lucide-react";

interface InnerVoiceModalProps {
  character: Character | null;
  mode: "current" | "history";
  onModeChange: (mode: "current" | "history") => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  record: InnerVoiceRecord | null;
  history: InnerVoiceRecord[];
  getEmotion: (record: InnerVoiceRecord) => string;
  onRefresh: () => void | Promise<void>;
}

export function InnerVoiceModal({ character, mode, onModeChange, onClose, loading, error, record, history, getEmotion, onRefresh }: InnerVoiceModalProps) {
  return (
    <Modal
      open={Boolean(character)}
      onClose={onClose}
      title={mode === "history" ? "历史心声" : "角色心声"}
      headerActions={mode === "current" ? (
        <button
          type="button"
          className="inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-full p-0 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void onRefresh()}
          disabled={loading}
          aria-label="刷新心声"
          title="重新生成心声"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : undefined} />
        </button>
      ) : undefined}
      description={character ? (
        <span className="flex items-center gap-2">
          <RenderAvatar src={character.avatar} alt="" name={character.name} className="h-7 w-7 rounded-full object-cover" />
          <span>{character.remark || character.name}</span>
        </span>
      ) : undefined}
      ariaLabel="角色心声"
      footer={mode === "current" ? (
        <Button variant="secondary" fullWidth onClick={() => onModeChange("history")}>查看历史心声</Button>
      ) : (
        <Button variant="secondary" fullWidth onClick={() => onModeChange("current")}>返回当前心声</Button>
      )}
    >
      {mode === "current" ? (
        <div className="space-y-3">
          {loading && <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">正在捕捉此刻的心声…</p>}
          {!loading && error && <p className="py-6 text-center text-sm text-red-500">{error}</p>}
          {!loading && record && (
            <Card variant="secondary" padding="md" className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">此刻的心声</h3>
              <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-text-primary)]">{record.content}</p>
              <div className="border-t border-[var(--divider)]" />
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-[var(--color-text-secondary)]">此刻情绪</h4>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-primary)]">{getEmotion(record)}</p>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">还没有历史心声。</p>
          ) : history.map((item) => (
            <div key={item.id}>
              <Card variant="outlined" padding="md" className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)]">
                  <span>{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">此刻的心声</h3>
                <p className="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
                <div className="border-t border-[var(--divider)]" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-[var(--color-text-secondary)]">此刻情绪</h4>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-primary)]">{getEmotion(item)}</p>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
