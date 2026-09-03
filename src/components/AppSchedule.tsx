import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import type { Appointment, ScheduleEntry } from "../domain/schedule/scheduleTypes";
import { filterScheduleEntries, formatScheduleDate, formatScheduleTime, SCHEDULE_FILTERS, SCHEDULE_STATUS_META, type ScheduleFilter } from "../features/schedule/schedulePresentation";
import type { Character } from "../types";
import AppointmentDetailSheet from "./schedule/AppointmentDetailSheet";
import ScheduleEventCard from "./schedule/ScheduleEventCard";

interface AppScheduleProps {
  entries: ScheduleEntry[];
  appointments: Appointment[];
  characters: Character[];
  onOpenChat: (characterId: string, relationId: string) => void;
  onClose: () => void;
  hideHeader?: boolean;
  variant?: "default" | "characterPhone";
  todaySignal?: number;
  onCharacterPhoneScheduleAdd?: (entry: ScheduleEntry) => void;
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const CHARACTER_PHONE_EVENT_COLORS = [
  "bg-[#f6e9ea]",
  "bg-[#e8f0f7]",
  "bg-[#f5efe0]",
  "bg-[#e8f1eb]",
  "bg-[#eee9f5]",
];

const characterPhoneEventColor = (id: string): string => {
  const hash = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0);
  return CHARACTER_PHONE_EVENT_COLORS[hash % CHARACTER_PHONE_EVENT_COLORS.length];
};

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function AppSchedule({ entries, appointments, characters, onOpenChat, onClose, hideHeader = false, variant = "default", todaySignal = 0, onCharacterPhoneScheduleAdd }: AppScheduleProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [filter, setFilter] = useState<ScheduleFilter>("upcoming");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [characterPhoneAddedEntries, setCharacterPhoneAddedEntries] = useState<ScheduleEntry[]>([]);
  const [characterPhoneAddForm, setCharacterPhoneAddForm] = useState<"schedule" | null>(null);
  const [characterPhoneAddTitle, setCharacterPhoneAddTitle] = useState("");
  const [characterPhoneAddTime, setCharacterPhoneAddTime] = useState("");
  const [characterPhoneAddAllDay, setCharacterPhoneAddAllDay] = useState(false);
  const [isCharacterPhoneFabVisible, setIsCharacterPhoneFabVisible] = useState(true);
  const characterPhoneScheduleScrollTop = useRef(0);

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

  const characterPhoneEntries = useMemo(
    () => variant === "characterPhone" ? [...entries, ...characterPhoneAddedEntries] : entries,
    [characterPhoneAddedEntries, entries, variant],
  );
  const visibleEntries = useMemo(() => filterScheduleEntries(characterPhoneEntries, filter), [characterPhoneEntries, filter]);
  const selectedEntries = visibleEntries.filter((entry) => entry.dateKey === selectedDate);
  const selectedEntry = characterPhoneEntries.find((entry) => entry.id === selectedEntryId);
  const selectedAppointment = selectedEntry
    ? appointments.find((appointment) => appointment.id === selectedEntry.appointmentId)
    : undefined;
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const selectedDateValue = new Date(`${selectedDate}T00:00:00`);
  const selectedDayLabel = selectedDateValue.toLocaleDateString("en-US", { weekday: "long" });
  const selectedDayNumber = selectedDateValue.getDate();
  const characterPhoneMonthLabel = visibleMonth.toLocaleDateString("en-US", { month: "long" });

  const characterFor = (characterId: string): Character | undefined => characters.find((character) => character.id === characterId);
  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    setVisibleMonth(next);
    setSelectedDate(toDateKey(next));
  };
  useEffect(() => {
    if (!todaySignal) return;
    const today = new Date();
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(toDateKey(today));
  }, [todaySignal]);

  const openCharacterPhoneAddForm = () => {
    setCharacterPhoneAddForm("schedule");
    setCharacterPhoneAddTitle("");
    setCharacterPhoneAddTime("09:00");
    setCharacterPhoneAddAllDay(false);
  };

  const closeCharacterPhoneAddForm = () => {
    setCharacterPhoneAddForm(null);
    setCharacterPhoneAddTitle("");
    setCharacterPhoneAddTime("");
    setCharacterPhoneAddAllDay(false);
  };

  const submitCharacterPhoneAddForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = characterPhoneAddTitle.trim();
    if (!title || !characterPhoneAddForm) return;

    const now = Date.now();
    const isAllDay = characterPhoneAddAllDay || !characterPhoneAddTime;
    const timestamp = new Date(`${selectedDate}T${characterPhoneAddTime || "12:00"}:00`).getTime();
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
      startAt: isAllDay || Number.isNaN(timestamp) ? undefined : timestamp,
      timePrecision: isAllDay ? "date_only" : "exact",
      traveler: "undetermined",
      createdAt: now,
      updatedAt: now,
    };
    if (onCharacterPhoneScheduleAdd) {
      onCharacterPhoneScheduleAdd(entry);
    } else {
      setCharacterPhoneAddedEntries((current) => [...current, entry]);
    }
    closeCharacterPhoneAddForm();
  };

  const handleCharacterPhoneScheduleScroll = (event: React.UIEvent<HTMLElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    const previousScrollTop = characterPhoneScheduleScrollTop.current;
    if (scrollTop <= 4 || scrollTop < previousScrollTop - 2) {
      setIsCharacterPhoneFabVisible(true);
    } else if (scrollTop > previousScrollTop + 2) {
      setIsCharacterPhoneFabVisible(false);
    }
    characterPhoneScheduleScrollTop.current = scrollTop;
  };

  return (
    <div data-theme-page="schedule" className="relative flex h-full flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      {!hideHeader && (
        <header className="relative flex shrink-0 items-center justify-between px-4 py-3">
          <button id="schedule_back_btn" type="button" onClick={onClose} title="返回" aria-label="返回桌面" className="app-nav-icon-button back-btn flex h-9 w-9 items-center justify-center">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-extrabold tracking-tight">日程</h1>
          <span className="h-9 w-9" aria-hidden="true" />
        </header>
      )}

      {variant === "characterPhone" ? (
        <>
        <main onScroll={handleCharacterPhoneScheduleScroll} className="flex-1 overflow-y-auto bg-white px-5 pb-8 text-[#2a2a2a]">
          <div className="flex h-9 items-center justify-between px-1">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="上个月" className="flex h-8 w-8 items-center justify-center text-neutral-500 transition-colors hover:text-neutral-900">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => changeMonth(1)} aria-label="下个月" className="flex h-8 w-8 items-center justify-center text-neutral-500 transition-colors hover:text-neutral-900">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="flex justify-center pb-1 pt-0 text-center">
            <div>
              <p className="character-phone-signature-font text-[4.8rem] font-normal leading-none tracking-tight text-neutral-800">
                {characterPhoneMonthLabel}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-7 text-right">
            <span className="col-start-7 pr-5 text-sm tracking-[0.18em] text-neutral-400">{year}</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-[#9b9b9b]">
            {WEEKDAY_LABELS.map((label) => <span key={label} className="py-2">{label}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-2 text-center">
            {calendarCells.map((day, index) => {
              if (day === null) return <span key={`phone-blank-${index}`} className="h-9" aria-hidden="true" />;
              const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = selectedDate === dateKey;
              const dayEntries = visibleEntries.filter((entry) => entry.dateKey === dateKey);
              return (
                <button
                  key={`phone-day-${dateKey}`}
                  type="button"
                  onClick={() => setSelectedDate(dateKey)}
                  aria-pressed={isSelected}
                  className="flex h-9 items-center justify-center"
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${isSelected ? "border border-neutral-700 text-neutral-900" : dayEntries.length > 0 ? "bg-[#f5eee5]" : "text-neutral-600 hover:bg-neutral-100"}`}>
                    {day}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-10 flex gap-3 border-t border-neutral-200 pt-7">
            <div className="w-20 shrink-0 text-right">
              <p className="character-phone-signature-font whitespace-nowrap text-[1.8rem] font-normal leading-none text-neutral-500">{selectedDayLabel}</p>
              <p className="mt-1 text-2xl font-light leading-none text-neutral-900">{selectedDayNumber}</p>
            </div>
            <div className="min-w-0 flex-1 border-l border-neutral-700 pl-5">
              {selectedEntries.length === 0 ? (
                <div className="py-2 text-sm text-neutral-400">这一天还没有安排</div>
              ) : (
                selectedEntries.map((entry) => {
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedEntryId(entry.id)}
                      className={`mb-3 flex w-full items-center gap-2 rounded-[18px] px-3 py-3 text-left last:mb-0 ${characterPhoneEventColor(entry.id)}`}
                    >
                      <span className="shrink-0 text-xs font-medium text-neutral-500">
                        {formatScheduleTime(entry)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-800">{entry.title}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </main>
        {characterPhoneAddForm && (
          <form onSubmit={submitCharacterPhoneAddForm} className="absolute bottom-20 left-5 right-5 z-30 rounded-2xl border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.14)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800">添加日程</h2>
              <button type="button" onClick={closeCharacterPhoneAddForm} aria-label="关闭添加面板" className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              autoFocus
              value={characterPhoneAddTitle}
              onChange={(event) => setCharacterPhoneAddTitle(event.target.value)}
              placeholder="日程内容"
              aria-label="日程内容"
              className="mt-3 w-full border-b border-neutral-200 px-1 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-700"
            />
            {characterPhoneAddForm === "schedule" && (
              <div className="mt-3 flex items-center justify-between px-1 text-xs text-neutral-500">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={characterPhoneAddAllDay} onChange={(event) => setCharacterPhoneAddAllDay(event.target.checked)} className="h-4 w-4 accent-neutral-700" />
                  全天
                </label>
                {!characterPhoneAddAllDay && (
                  <input type="time" value={characterPhoneAddTime} onChange={(event) => setCharacterPhoneAddTime(event.target.value)} className="rounded-lg border border-neutral-200 px-2 py-1 text-sm text-neutral-700 outline-none" />
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeCharacterPhoneAddForm} className="rounded-lg px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-100">取消</button>
              <button type="submit" disabled={!characterPhoneAddTitle.trim()} className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">添加</button>
            </div>
          </form>
        )}
        <button
          type="button"
          aria-label={characterPhoneAddForm ? "关闭添加日程" : "添加日程"}
          aria-expanded={Boolean(characterPhoneAddForm)}
          onClick={() => {
            if (characterPhoneAddForm) {
              closeCharacterPhoneAddForm();
              return;
            }
            openCharacterPhoneAddForm();
          }}
          className={`absolute bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-[0_6px_16px_rgba(15,23,42,0.2)] transition-[opacity,transform] duration-300 ease-out active:scale-95 ${isCharacterPhoneFabVisible || characterPhoneAddForm ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
        >
          {characterPhoneAddForm ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </button>
        </>
      ) : (
      <main className="flex-1 overflow-y-auto px-4 pb-8">
        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-extrabold">{year}年{month + 1}月</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => changeMonth(-1)} aria-label="上个月" className="app-nav-icon-button flex h-8 w-8 items-center justify-center"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => changeMonth(1)} aria-label="下个月" className="app-nav-icon-button flex h-8 w-8 items-center justify-center"><ChevronRight className="h-4 w-4" /></button>
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
      )}

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
