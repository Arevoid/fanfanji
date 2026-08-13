import React from "react";
import { MapPin } from "lucide-react";
import type { ScheduleEntry } from "../../domain/schedule/scheduleTypes";
import { formatScheduleTime, SCHEDULE_STATUS_META } from "../../features/schedule/schedulePresentation";

interface ScheduleEventCardProps {
  entry: ScheduleEntry;
  characterName: string;
  characterAvatar?: string;
  onOpen: () => void;
}

export default function ScheduleEventCard({ entry, characterName, characterAvatar, onOpen }: ScheduleEventCardProps) {
  const status = SCHEDULE_STATUS_META[entry.status];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="schedule-event-card flex w-full items-start gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-sm transition-transform active:scale-[0.99]"
    >
      <span className="w-12 shrink-0 pt-1 text-center text-xs font-extrabold text-[var(--text-secondary)]">{formatScheduleTime(entry)}</span>
      <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${status.dotClass}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-extrabold">{entry.title}</span>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${status.badgeClass}`}>{status.label}</span>
        </span>
        <span className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          {characterAvatar ? <img src={characterAvatar} alt="" className="h-5 w-5 rounded-full object-cover" /> : <span className="h-5 w-5 rounded-full bg-[var(--surface-raised)]" />}
          <span className="truncate">{characterName}</span>
        </span>
        {(entry.activity || entry.location) && (
          <span className="mt-2 flex items-start gap-1 text-xs leading-5 text-[var(--text-secondary)]">
            {entry.location && <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>{[entry.activity, entry.location].filter(Boolean).join(" · ")}</span>
          </span>
        )}
      </span>
    </button>
  );
}
