import React from "react";
import type { MomentVisibility } from "../../../types";
import { formatMomentVisibilityLabel } from "../services/momentVisibility";

export interface MomentAudienceOption {
  id: string;
  label: string;
  avatar?: string;
}

export interface MomentAudiencePickerProps {
  visibility: MomentVisibility;
  targetIds: string[];
  options: MomentAudienceOption[];
  onVisibilityChange: (visibility: MomentVisibility) => void;
  onTargetIdsChange: (targetIds: string[]) => void;
  className?: string;
  showLabel?: boolean;
}

const VISIBILITY_OPTIONS: Array<{ value: MomentVisibility; label: string; description: string }> = [
  { value: "public", label: "公开", description: "所有人可见" },
  { value: "private", label: "私密", description: "仅自己可见" },
  { value: "specific", label: "特别的人", description: "只让选中的角色查看" },
];

/** Shared audience control for the main Moments feed and character-phone Moments. */
export const MomentAudiencePicker: React.FC<MomentAudiencePickerProps> = ({ visibility, targetIds, options, onVisibilityChange, onTargetIdsChange, className = "", showLabel = true }) => {
  const [open, setOpen] = React.useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = React.useState(false);
  const [draftTargetIds, setDraftTargetIds] = React.useState<string[]>(targetIds);

  const openTargetPicker = () => {
    setDraftTargetIds(targetIds);
    setOpen(false);
    setTargetPickerOpen(true);
  };

  const chooseVisibility = (value: MomentVisibility) => {
    if (value === "specific") {
      openTargetPicker();
      return;
    }
    onVisibilityChange(value);
    setOpen(false);
  };

  const toggleDraftTarget = (id: string) => {
    setDraftTargetIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const confirmTargetPicker = () => {
    if (draftTargetIds.length === 0) return;
    onTargetIdsChange(draftTargetIds);
    onVisibilityChange("specific");
    setTargetPickerOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open || targetPickerOpen}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
      >
        <span className="min-w-0 truncate font-semibold">
          {showLabel && <span className="mr-2 text-[10px] font-normal text-[var(--text-tertiary)]">谁可以看</span>}
          <span>{formatMomentVisibilityLabel(visibility)}{visibility === "specific" && targetIds.length > 0 ? `（${targetIds.length}人）` : ""}</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="选择朋友圈可见范围" className="relative w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">谁可以看</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-xs text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)]">取消</button>
            </div>
            <div className="space-y-2">
              {VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={visibility === option.value}
                  onClick={() => chooseVisibility(option.value)}
                  className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${visibility === option.value ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--border)] hover:bg-[var(--surface-muted)]"}`}
                >
                  <span>
                    <span className="block text-xs font-semibold">{option.label}</span>
                    <span className="block text-[10px] text-[var(--text-tertiary)]">{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {targetPickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" onClick={() => setTargetPickerOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="选择可见角色" className="relative flex max-h-[min(78vh,30rem)] w-full max-w-sm flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">选择可见角色</h2>
                <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">只让选中的角色查看这条动态</p>
              </div>
              <button type="button" onClick={() => setTargetPickerOpen(false)} className="rounded-lg px-2 py-1 text-xs text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)]">取消</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {options.length === 0 ? (
                <p className="rounded-xl bg-[var(--surface-muted)] px-3 py-4 text-center text-[11px] text-[var(--text-tertiary)]">暂无可选择的角色</p>
              ) : (
                <div className="space-y-1">
                  {options.map((option) => (
                    <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-[var(--surface-muted)]">
                      <input type="checkbox" checked={draftTargetIds.includes(option.id)} onChange={() => toggleDraftTarget(option.id)} className="h-4 w-4 accent-[var(--color-accent)]" />
                      {option.avatar ? <img src={option.avatar} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="h-8 w-8 rounded-full bg-[var(--surface-muted)]" aria-hidden="true" />}
                      <span className="min-w-0 flex-1 truncate text-xs">{option.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
              <p className={`text-[10px] ${draftTargetIds.length === 0 ? "text-rose-500" : "text-[var(--text-tertiary)]"}`}>{draftTargetIds.length === 0 ? "至少选择一个角色" : `已选择 ${draftTargetIds.length} 人`}</p>
              <button type="button" disabled={draftTargetIds.length === 0} onClick={confirmTargetPicker} className="min-h-10 rounded-xl bg-[var(--color-accent)] px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
