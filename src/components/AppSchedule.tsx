import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Appointment, ScheduleEntry } from "../domain/schedule/scheduleTypes";
import { filterScheduleEntries, formatScheduleDate, SCHEDULE_FILTERS, SCHEDULE_STATUS_META, type ScheduleFilter } from "../features/schedule/schedulePresentation";
import type { Character } from "../types";
import AppointmentDetailSheet from "./schedule/AppointmentDetailSheet";
import ScheduleEventCard from "./schedule/ScheduleEventCard";

interface AppScheduleProps {
  entries: ScheduleEntry[];
  appointments: Appointment[];
  characters: Character[];
  onOpenChat: (characterId: string, relationId: string) => void;
  onClose: () => void;
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function AppSchedule({ entries, appointments, characters, onOpenChat, onClose }: AppScheduleProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [filter, setFilter] = useState<ScheduleFilter>("upcoming");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const calendarCells = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const mondayFirstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: mondayFirstOffset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [visibleMonth]);

  const visibleEntries = useMemo(() => filterScheduleEntries(entries, filter), [entries, filter]);
  const selectedEntries = visibleEntries.filter((entry) => entry.dateKey === selectedDate);
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
  const selectedAppointment = selectedEntry
    ? appointments.find((appointment) => appointment.id === selectedEntry.appointmentId)
    : undefined;
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();

  const characterFor = (characterId: string): Character | undefined => characters.find((character) => character.id === characterId);
  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    setVisibleMonth(next);
    setSelectedDate(toDateKey(next));
  };

  return (
    <div data-theme-page="schedule" className="relative flex h-full flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="relative flex shrink-0 items-center justify-between px-4 py-3">
        <button id="schedule_back_btn" type="button" onClick={onClose} title="返回" aria-label="返回桌面" className="back-btn flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-extrabold tracking-tight">日程</h1>
        <span className="h-9 w-9" aria-hidden="true" />
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-8">
        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-extrabold">{year}年{month + 1}月</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => changeMonth(-1)} aria-label="上个月" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-raised)]"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => changeMonth(1)} aria-label="下个月" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-raised)]"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[var(--text-secondary)]">
            {WEEKDAY_LABELS.map((label) => <span key={label} className="py-1">{label}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarCells.map((day, index) => {
              if (day === null) return <span key={`blank-${index}`} className="aspect-square" aria-hidden="true" />;
              const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = selectedDate === dateKey;
              const dayEntries = visibleEntries.filter((entry) => entry.dateKey === dateKey);
              return (
                <button key={dateKey} type="button" onClick={() => setSelectedDate(dateKey)} aria-pressed={isSelected} className={`relative flex aspect-square items-center justify-center rounded-full text-xs font-bold transition-colors ${isSelected ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "hover:bg-[var(--surface-raised)]"}`}>
                  {day}
                  {dayEntries.length > 0 && (
                    <span className="absolute bottom-1 flex gap-0.5" aria-hidden="true">
                      {dayEntries.slice(0, 3).map((entry) => <span key={entry.id} className={`h-1 w-1 rounded-full ${isSelected ? "bg-[var(--accent-contrast)]" : SCHEDULE_STATUS_META[entry.status].dotClass}`} />)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <nav aria-label="日程状态筛选" className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
          {SCHEDULE_FILTERS.map((item) => (
            <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={`schedule-filter-control shrink-0 rounded-full border font-bold transition-colors ${filter === item.id ? "border-[var(--button-primary-bg)] bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"}`}>
              {item.label}
            </button>
          ))}
        </nav>

        <section className="mt-4">
          <h2 className="px-1 text-sm font-extrabold">{formatScheduleDate(selectedDate)}</h2>
          {selectedEntries.length === 0 ? (
            <div className="mt-3 flex min-h-52 flex-col items-center justify-center rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-7 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-raised)] text-[var(--text-secondary)]"><CalendarDays className="h-7 w-7" /></span>
              <p className="text-sm font-extrabold">{entries.length === 0 ? "暂时没有线下约定" : "这个日期没有相关约定"}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">对方发起并由你接受的见面安排，会按照当前状态显示在这里。</p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {selectedEntries.map((entry) => {
                const character = characterFor(entry.characterId);
                return (
                  <div key={entry.id}>
                    <ScheduleEventCard entry={entry} characterName={character?.remark || character?.name || "好友"} characterAvatar={character?.avatar} onOpen={() => setSelectedEntryId(entry.id)} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {selectedEntry && selectedAppointment && (() => {
        const character = characterFor(selectedEntry.characterId);
        return (
          <AppointmentDetailSheet
            appointment={selectedAppointment}
            entry={selectedEntry}
            characterName={character?.remark || character?.name || "好友"}
            characterAvatar={character?.avatar}
            onClose={() => setSelectedEntryId(null)}
            onOpenChat={() => onOpenChat(selectedEntry.characterId, selectedEntry.relationId)}
          />
        );
      })()}
    </div>
  );
}
