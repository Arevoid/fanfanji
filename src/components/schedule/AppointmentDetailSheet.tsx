import React from "react";
import { CalendarDays, MapPin, MessageCircle, Route, X } from "lucide-react";
import type { Appointment, ScheduleEntry } from "../../domain/schedule/scheduleTypes";
import { formatProposalSummary, formatScheduleDate, formatScheduleTime, SCHEDULE_STATUS_META } from "../../features/schedule/schedulePresentation";

interface AppointmentDetailSheetProps {
  appointment: Appointment;
  entry: ScheduleEntry;
  characterName: string;
  characterAvatar?: string;
  onClose: () => void;
  onOpenChat: () => void;
}

const PROPOSAL_STATUS_LABEL = { active: "当前方案", superseded: "已被修改", rejected: "未采用" } as const;

export default function AppointmentDetailSheet({ appointment, entry, characterName, characterAvatar, onClose, onOpenChat }: AppointmentDetailSheetProps) {
  const status = SCHEDULE_STATUS_META[entry.status];
  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/25 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="约定详情" onClick={onClose}>
      <section className="max-h-[88%] w-full overflow-y-auto rounded-t-[30px] bg-[var(--surface)] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {characterAvatar ? <img src={characterAvatar} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="h-11 w-11 rounded-full bg-[var(--surface-raised)]" />}
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold">{entry.title}</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">与{characterName}的线下约定</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭约定详情" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)]"><X className="h-4 w-4" /></button>
        </div>

        <span className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${status.badgeClass}`}>{status.label}</span>

        <div className="mt-4 space-y-3 rounded-[22px] bg-[var(--surface-raised)] p-4 text-xs">
          <div className="flex gap-3"><CalendarDays className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" /><div><p className="font-bold">时间</p><p className="mt-1 text-[var(--text-secondary)]">{entry.dateKey ? formatScheduleDate(entry.dateKey) : "日期待定"} · {formatScheduleTime(entry)}</p></div></div>
          <div className="flex gap-3"><MapPin className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" /><div><p className="font-bold">地点与活动</p><p className="mt-1 text-[var(--text-secondary)]">{[entry.location || "地点待定", entry.activity].filter(Boolean).join(" · ")}</p></div></div>
          <div className="flex gap-3"><Route className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" /><div><p className="font-bold">行程</p><p className="mt-1 text-[var(--text-secondary)]">{entry.traveler === "character" ? `${characterName}前往` : entry.traveler === "user" ? "你前往" : entry.traveler === "both" ? "双方前往" : "行程待定"}</p></div></div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-extrabold">约定过程</h3>
          <div className="mt-3 space-y-3 border-l border-[var(--border)] pl-4">
            {appointment.proposals.map((proposal) => (
              <div key={proposal.id} className="relative text-xs">
                <span className={`absolute -left-[20.5px] top-1.5 h-2 w-2 rounded-full ${proposal.status === "active" ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
                <div className="flex items-center justify-between gap-2"><p className="font-bold">{proposal.proposedBy === "character" ? `${characterName}提出` : "你提出修改"}</p><span className="text-[10px] text-[var(--text-secondary)]">{PROPOSAL_STATUS_LABEL[proposal.status]}</span></div>
                <p className={`mt-1 leading-5 ${proposal.status === "active" ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] line-through"}`}>{formatProposalSummary(proposal)}</p>
              </div>
            ))}
          </div>
        </div>

        <button type="button" onClick={onOpenChat} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--button-primary-bg)] px-4 py-3 text-xs font-extrabold text-[var(--button-primary-text)]">
          <MessageCircle className="h-4 w-4" />返回关联聊天
        </button>
      </section>
    </div>
  );
}
