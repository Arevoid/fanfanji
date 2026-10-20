import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentAppointmentProposal } from "../../../domain/schedule/appointmentPolicy";
import { decideAppointmentInvitation } from "../../../domain/schedule/appointmentInvitation";
import { confirmAppointmentWithTime, formatAppointmentLocalTime, needsAppointmentTimeSelection, parseAppointmentLocalTime } from "../../../domain/schedule/appointmentConfirmation";
import type { Appointment } from "../../../domain/schedule/scheduleTypes";

const PERIOD_LABELS: Record<string, string> = { morning: "上午", afternoon: "下午", evening: "晚上", date_only: "日期已定，具体时刻待确认" };

export function OfflineInvitationCard({ appointment, onSave, onNotice }: {
  appointment: Appointment; onSave: (appointment: Appointment) => boolean; onNotice: (message: string) => void;
}) {
  const proposal = getCurrentAppointmentProposal(appointment);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const saving = useRef(false), saved = useRef(false), dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(), timeId = useId(), locationId = useId(), errorId = useId();
  const stale = editing && snapshot !== JSON.stringify(appointment);
  useEffect(() => { if (editing && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [editing]);
  const close = () => { if (!saving.current) { dialog.current?.close(); setEditing(false); setError(""); } };
  const save = (updated: Appointment | undefined, accepted: boolean) => {
    if (saving.current || saved.current) return;
    if (!updated) { setError("邀约信息已失效，请重新确认。"); return; }
    saving.current = true;
    try {
      if (!onSave(updated)) { setError("保存失败，请重试。填写的时间和地点已保留。"); return; }
      saved.current = true;
      dialog.current?.close(); setEditing(false); setError("");
      onNotice(accepted ? "已接受线下邀约，双方日程已同步" : "已拒绝这条线下邀约");
    } catch { setError("保存失败，请重试。填写的时间和地点已保留。"); }
    finally { saving.current = false; }
  };
  const accept = () => {
    if (saved.current || saving.current) return;
    if (!proposal) { setError("这条邀约缺少有效方案，请先在聊天中重新协商。"); return; }
    if (!needsAppointmentTimeSelection(appointment)) { save(decideAppointmentInvitation(appointment, "accept"), true); return; }
    setSnapshot(JSON.stringify(appointment));
    setTime(proposal.startAt !== undefined && proposal.startAt > Date.now() ? formatAppointmentLocalTime(proposal.startAt) : "");
    setLocation(proposal.location || ""); setError(""); setEditing(true);
  };
  const timing = !proposal?.startAt
    ? appointment.mode === "immediate" ? "现在见面 · 等你选择" : "时间待确认"
    : new Date(proposal.startAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return <>
    <div className="chat-appointment-invitation mx-3 mb-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">线下邀约 · 待你确认</div>
          <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{proposal?.activity || appointment.title}</div>
          <div className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{timing}{proposal?.location ? ` · ${proposal.location}` : ""}</div>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--surface-raised)] px-2 py-1 text-[10px] text-[var(--text-secondary)]">待你确认</span>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => save(decideAppointmentInvitation(appointment, "decline"), false)} className="min-h-11 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">拒绝</button>
        <button type="button" onClick={accept} className="min-h-11 flex-1 rounded-xl bg-[var(--button-primary-bg)] px-3 py-2 text-xs font-bold text-[var(--button-primary-text)]">接受</button>
      </div>
      {!editing && error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
    {editing && createPortal(<dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text-primary)] shadow-xl backdrop:bg-black/40"
      style={{ maxHeight: "calc(100dvh - 2rem)" }}>
      <form onSubmit={event => {
        event.preventDefault();
        if (stale) { setError("邀约已更新，请关闭后重新确认。"); return; }
        const timestamp = parseAppointmentLocalTime(time);
        if (timestamp === undefined || timestamp <= Date.now()) { setError("请选择有效的未来日期和时间。"); return; }
        save(confirmAppointmentWithTime(appointment, timestamp, location), true);
      }} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="shrink-0 border-b border-[var(--border)] px-5 py-4"><h2 id={titleId} className="font-bold">确认见面时间</h2></div>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          <p className="break-words text-sm">{proposal?.activity || appointment.title}</p>
          <p className="text-xs leading-5 text-[var(--text-secondary)]">补齐时间后确认接受，才会同步到双方日程。时间按当前设备时区显示。</p>
          {proposal && PERIOD_LABELS[proposal.timePrecision] && <p className="text-xs text-[var(--text-secondary)]">原邀约：{PERIOD_LABELS[proposal.timePrecision]}，请选择具体时间。</p>}
          <div><label htmlFor={timeId} className="mb-2 block text-sm">见面时间</label>
            <input id={timeId} type="datetime-local" required value={time} min={formatAppointmentLocalTime(Date.now() + 60_000)} onChange={event => { setTime(event.target.value); setError(""); }} aria-describedby={error ? errorId : undefined}
              className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm" /></div>
          <div><label htmlFor={locationId} className="mb-2 block text-sm">见面地点（选填）</label>
            <input id={locationId} value={location} maxLength={200} onChange={event => setLocation(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm" /></div>
          {(stale || error) && <p id={errorId} role="alert" className="text-sm text-red-600">{stale ? "邀约已更新，请关闭后重新确认。" : error}</p>}
        </div>
        <div className="flex shrink-0 gap-3 border-t border-[var(--border)] p-4">
          <button type="button" onClick={close} className="min-h-11 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">取消</button>
          <button type="submit" disabled={stale} className="min-h-11 flex-1 rounded-xl bg-[var(--button-primary-bg)] px-3 py-2 text-sm font-bold text-[var(--button-primary-text)] disabled:opacity-40">确认接受</button>
        </div>
      </form>
    </dialog>, document.body)}
  </>;
}
