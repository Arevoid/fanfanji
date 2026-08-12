import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { ScheduleEntry } from "../domain/schedule/scheduleTypes";

interface AppScheduleProps {
  entries: ScheduleEntry[];
  onClose: () => void;
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function AppSchedule({ entries, onClose }: AppScheduleProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

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

  const selectedEntries = entries.filter((entry) => entry.dateKey === selectedDate);
  const eventDates = new Set(entries.map((entry) => entry.dateKey).filter(Boolean));
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();

  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    setVisibleMonth(next);
    setSelectedDate(toDateKey(next));
  };

  return (
    <div data-theme-page="schedule" className="flex h-full flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="relative flex shrink-0 items-center justify-between px-4 py-3">
        <button
          id="schedule_back_btn"
          type="button"
          onClick={onClose}
          title="返回"
          aria-label="返回桌面"
          className="back-btn flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]"
        >
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
              <button type="button" onClick={() => changeMonth(-1)} aria-label="上个月" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-raised)]">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => changeMonth(1)} aria-label="下个月" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-raised)]">
                <ChevronRight className="h-4 w-4" />
              </button>
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
              const hasEvent = eventDates.has(dateKey);
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDate(dateKey)}
                  aria-pressed={isSelected}
                  className={`relative flex aspect-square items-center justify-center rounded-full text-xs font-bold transition-colors ${isSelected ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "hover:bg-[var(--surface-raised)]"}`}
                >
                  {day}
                  {hasEvent && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${isSelected ? "bg-[var(--accent-contrast)]" : "bg-[var(--accent)]"}`} />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5">
          <h2 className="px-1 text-sm font-extrabold">{selectedDate.replaceAll("-", "年").replace(/年(\d{2})$/, "月$1日")}</h2>
          {selectedEntries.length === 0 ? (
            <div className="mt-3 flex min-h-56 flex-col items-center justify-center rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-7 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-raised)] text-[var(--text-secondary)]">
                <CalendarDays className="h-7 w-7" />
              </span>
              <p className="text-sm font-extrabold">暂时没有线下约定</p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">对方发起并由你接受的见面安排，之后会显示在这里。</p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {selectedEntries.map((entry) => (
                <article key={entry.id} className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="text-sm font-extrabold">{entry.title}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{entry.status}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
