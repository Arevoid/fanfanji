import React from "react";
import { Check, ChevronDown, Users } from "lucide-react";
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
}

const VISIBILITY_OPTIONS: Array<{ value: MomentVisibility; label: string; description: string }> = [
  { value: "public", label: "公开", description: "所有人可见" },
  { value: "private", label: "私密", description: "仅自己可见" },
  { value: "specific", label: "特别的人", description: "只让选中的角色查看" },
];

/** Shared, touch-friendly audience control used by both Moments entry points. */
export const MomentAudiencePicker: React.FC<MomentAudiencePickerProps> = ({ visibility, targetIds, options, onVisibilityChange, onTargetIdsChange, className = "" }) => {
  const [open, setOpen] = React.useState(false);
  const toggleTarget = (id: string) => {
    onTargetIdsChange(targetIds.includes(id) ? targetIds.filter((item) => item !== id) : [...targetIds, id]);
  };
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[10px] text-[var(--text-tertiary)]">谁可以看</span>
            <span className="block truncate font-semibold">{formatMomentVisibilityLabel(visibility)}{visibility === "specific" && targetIds.length > 0 ? `（${targetIds.length}人）` : ""}</span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label="选择朋友圈可见范围" className="absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
          <div className="space-y-1">
            {VISIBILITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onVisibilityChange(option.value)}
                className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors ${visibility === option.value ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "hover:bg-[var(--surface-muted)]"}`}
              >
                <span><span className="block text-xs font-semibold">{option.label}</span><span className="block text-[10px] text-[var(--text-tertiary)]">{option.description}</span></span>
                {visibility === option.value && <Check className="h-4 w-4" aria-hidden="true" />}
              </button>
            ))}
          </div>
          {visibility === "specific" && (
            <div className="mt-2 border-t border-[var(--border)] pt-2">
              <p className="px-3 pb-1 text-[10px] text-[var(--text-tertiary)]">选择可查看的角色</p>
              <div className="max-h-44 overflow-y-auto">
                {options.length === 0 ? (
                  <p className="px-3 py-3 text-[11px] text-[var(--text-tertiary)]">暂无可选择的角色</p>
                ) : options.map((option) => (
                  <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 hover:bg-[var(--surface-muted)]">
                    <input type="checkbox" checked={targetIds.includes(option.id)} onChange={() => toggleTarget(option.id)} className="h-4 w-4 accent-[var(--color-accent)]" />
                    {option.avatar ? <img src={option.avatar} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="h-7 w-7 rounded-full bg-[var(--surface-muted)]" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate text-xs">{option.label}</span>
                  </label>
                ))}
                {options.length > 0 && targetIds.length === 0 && <p className="px-3 pt-1 text-[10px] text-rose-500">至少选择一个角色</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
