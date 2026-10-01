import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import type { Appointment, ScheduleEntry } from "../domain/schedule/scheduleTypes";
import type { CharacterScheduleEntry } from "../domain/characterLife/scheduleRuntime";
import type { CalendarViewItem, PeriodRecord, UserScheduleEntry } from "../domain/schedule/calendarTypes";
import { projectAppointmentCalendarItem } from "../domain/schedule/calendarTypes";
import { formatScheduleTime } from "../features/schedule/schedulePresentation";
import type { Character } from "../types";
import ScheduleDashboard from "./schedule/ScheduleDashboard";

interface AppScheduleProps {
  entries: ScheduleEntry[];
  userIdentityId?: string;
  appointments: Appointment[];
  characters: Character[];
  onOpenChat: (characterId: string, relationId: string) => void;
  onClose: () => void;
  hideHeader?: boolean;
  variant?: "default" | "characterPhone";
  todaySignal?: number;
  onCharacterPhoneScheduleAdd?: (entry: ScheduleEntry) => void;
  characterScheduleEntries?: CharacterScheduleEntry[];
  userScheduleEntries?: UserScheduleEntry[];
  periodRecords?: PeriodRecord[];
  onSaveUserSchedule?: (entry: UserScheduleEntry) => boolean;
  onDeleteCalendarItem?: (item: CalendarViewItem) => boolean;
  onSavePeriodRecord?: (record: PeriodRecord) => boolean;
  onDeletePeriodRecord?: (record: PeriodRecord) => boolean;
  onGenerateCharacterSchedule?: (input: { characterId: string; relationId?: string; range: "day" | "week" }) => Promise<{ dateKey?: string; count: number }> | { dateKey?: string; count: number };
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const PHONE_EVENT_COLORS = ["bg-[#f6e9ea]", "bg-[#e8f0f7]", "bg-[#f5efe0]", "bg-[#e8f1eb]", "bg-[#eee9f5]"];

const toDateKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const phoneEventColor = (id: string): string => {
  const hash = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0);
  return PHONE_EVENT_COLORS[hash % PHONE_EVENT_COLORS.length];
};

export default function AppSchedule({
  entries,
  userIdentityId,
  appointments,
  characters,
  onOpenChat,
  onClose,
  hideHeader = false,
  variant = "default",
  todaySignal = 0,
  onCharacterPhoneScheduleAdd,
  characterScheduleEntries = [],
  userScheduleEntries = [],
  periodRecords = [],
  onSaveUserSchedule,
  onDeleteCalendarItem,
  onSavePeriodRecord,
  onDeletePeriodRecord,
  onGenerateCharacterSchedule,
}: AppScheduleProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [phoneAddedEntries, setPhoneAddedEntries] = useState<ScheduleEntry[]>([]);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addTime, setAddTime] = useState("09:00");
  const [addAllDay, setAddAllDay] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const previousScrollTop = useRef(0);

  useEffect(() => {
    if (variant !== "characterPhone" && !todaySignal) return;
    const now = new Date();
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(toDateKey(now));
  }, [todaySignal, variant]);

  const monthYear = visibleMonth.getFullYear();
  const monthIndex = visibleMonth.getMonth();
  const calendarCells = useMemo(() => {
    const offset = (new Date(monthYear, monthIndex, 1).getDay() + 6) % 7;
    const days = new Date(monthYear, monthIndex + 1, 0).getDate();
    return [...Array.from({ length: offset }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)];
  }, [monthIndex, monthYear]);
  const phoneEntries = useMemo(() => [...entries, ...phoneAddedEntries], [entries, phoneAddedEntries]);
  const selectedEntries = phoneEntries.filter((entry) => entry.dateKey === selectedDate);

  const changeMonth = (offset: number) => {
    const next = new Date(monthYear, monthIndex + offset, 1);
    setVisibleMonth(next);
    setSelectedDate(toDateKey(next));
  };

  const submitPhoneEntry = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = addTitle.trim();
    if (!title) return;
    const now = Date.now();
    const timestamp = new Date(`${selectedDate}T${addTime || "12:00"}:00`).getTime();
    const id = `character-phone-schedule-${now}`;
    const entry: ScheduleEntry = {
      id,
      schemaVersion: 1,
      relationId: "character-phone-local",
      characterId: "character-phone-local",
      userIdentityId: "character-phone-local",
      category: "appointment",
      appointmentId: `${id}-appointment`,
      title,
      status: "confirmed",
      dateKey: selectedDate,
      ...(addAllDay || Number.isNaN(timestamp) ? {} : { startAt: timestamp }),
      timePrecision: addAllDay ? "date_only" : "exact",
      traveler: "undetermined",
      createdAt: now,
      updatedAt: now,
    };
    if (onCharacterPhoneScheduleAdd) onCharacterPhoneScheduleAdd(entry);
    else setPhoneAddedEntries((current) => [...current, entry]);
    setAddFormOpen(false);
    setAddTitle("");
    setAddTime("09:00");
    setAddAllDay(false);
  };

  const phonePage = variant === "characterPhone";

  return (
    <div data-theme-page="schedule" className="relative flex h-full flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      {phonePage && !hideHeader && (
        <header className="relative flex shrink-0 items-center justify-between px-4 py-3">
          <button type="button" onClick={onClose} aria-label="返回桌面" className="app-nav-icon-button flex h-9 w-9 items-center justify-center"><ChevronLeft className="h-5 w-5" /></button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-extrabold tracking-tight">日程</h1>
          <span className="h-9 w-9" aria-hidden="true" />
        </header>
      )}

      {phonePage ? (
        <>
          <main
            onScroll={(event) => {
              const next = event.currentTarget.scrollTop;
              const previous = previousScrollTop.current;
              setFabVisible(next <= 4 || next < previous - 2 || next <= previous + 2);
              previousScrollTop.current = next;
            }}
            className="flex-1 overflow-y-auto bg-white px-5 pb-8 text-[#2a2a2a]"
          >
            <div className="flex h-9 items-center justify-between px-1">
              <button type="button" onClick={() => changeMonth(-1)} aria-label="上个月" className="flex h-8 w-8 items-center justify-center text-neutral-500"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => changeMonth(1)} aria-label="下个月" className="flex h-8 w-8 items-center justify-center text-neutral-500"><ChevronRight className="h-5 w-5" /></button>
            </div>
            <div className="flex justify-center pb-1 text-center"><p className="character-phone-signature-font text-[4.8rem] font-normal leading-none tracking-tight text-neutral-800">{visibleMonth.toLocaleDateString("en-US", { month: "long" })}</p></div>
            <div className="grid grid-cols-7 text-right"><span className="col-start-7 pr-5 text-sm tracking-[0.18em] text-neutral-400">{monthYear}</span></div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-[#9b9b9b]">{WEEKDAY_LABELS.map((label) => <span key={label} className="py-2">{label}</span>)}</div>
            <div className="grid grid-cols-7 gap-y-2 text-center">
              {calendarCells.map((day, index) => {
                if (day === null) return <span key={`phone-empty-${index}`} className="h-9" aria-hidden="true" />;
                const dateKey = `${monthYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const active = selectedDate === dateKey;
                const hasEntries = phoneEntries.some((entry) => entry.dateKey === dateKey);
                return <button key={dateKey} type="button" onClick={() => setSelectedDate(dateKey)} aria-pressed={active} className="flex h-9 items-center justify-center"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${active ? "border border-neutral-700 text-neutral-900" : hasEntries ? "bg-[#f5eee5]" : "text-neutral-600"}`}>{day}</span></button>;
              })}
            </div>
            <div className="mt-10 flex gap-3 border-t border-neutral-200 pt-7">
              <div className="w-20 shrink-0 text-right"><p className="character-phone-signature-font whitespace-nowrap text-[1.8rem] font-normal leading-none text-neutral-500">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" })}</p><p className="mt-1 text-2xl font-light leading-none text-neutral-900">{new Date(`${selectedDate}T00:00:00`).getDate()}</p></div>
              <div className="min-w-0 flex-1 border-l border-neutral-700 pl-5">
                {selectedEntries.length === 0 ? <div className="py-2 text-sm text-neutral-400">这一天还没有安排</div> : selectedEntries.map((entry) => <button key={entry.id} type="button" className={`mb-3 flex w-full items-center gap-2 rounded-[18px] px-3 py-3 text-left last:mb-0 ${phoneEventColor(entry.id)}`}><span className="shrink-0 text-xs font-medium text-neutral-500">{formatScheduleTime(entry)}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-800">{entry.title}</span></button>)}
              </div>
            </div>
          </main>
          {addFormOpen && <form onSubmit={submitPhoneEntry} className="absolute bottom-20 left-5 right-5 z-30 rounded-2xl border border-black/5 bg-white p-4 shadow-lg"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-neutral-800">添加日程</h2><button type="button" onClick={() => setAddFormOpen(false)} aria-label="关闭添加面板" className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500"><X className="h-4 w-4" /></button></div><input autoFocus value={addTitle} onChange={(event) => setAddTitle(event.target.value)} placeholder="日程内容" aria-label="日程内容" className="mt-3 w-full border-b border-neutral-200 px-1 py-2 text-sm outline-none" /><div className="mt-3 flex items-center justify-between px-1 text-xs text-neutral-500"><label className="flex items-center gap-2"><input type="checkbox" checked={addAllDay} onChange={(event) => setAddAllDay(event.target.checked)} />全天</label>{!addAllDay && <input type="time" value={addTime} onChange={(event) => setAddTime(event.target.value)} className="rounded-lg border border-neutral-200 px-2 py-1 text-sm" />}</div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setAddFormOpen(false)} className="rounded-lg px-3 py-2 text-xs text-neutral-500">取消</button><button type="submit" disabled={!addTitle.trim()} className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-35">添加</button></div></form>}
          <button type="button" aria-label={addFormOpen ? "关闭添加日程" : "添加日程"} onClick={() => setAddFormOpen((open) => !open)} className={`absolute bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg transition-opacity ${fabVisible || addFormOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}>{addFormOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}</button>
        </>
      ) : (
        <ScheduleDashboard
          userIdentityId={userIdentityId || "identity-1"}
          appointments={appointments}
          appointmentEntries={entries.map(projectAppointmentCalendarItem)}
          characterScheduleEntries={characterScheduleEntries}
          userScheduleEntries={userScheduleEntries}
          periodRecords={periodRecords}
          characters={characters}
          onOpenChat={onOpenChat}
          onSaveUserSchedule={onSaveUserSchedule}
          onDeleteCalendarItem={onDeleteCalendarItem}
          onSavePeriodRecord={onSavePeriodRecord}
          onDeletePeriodRecord={onDeletePeriodRecord}
          onGenerateCharacterSchedule={onGenerateCharacterSchedule}
          onClose={onClose}
        />
      )}
    </div>
  );
}
