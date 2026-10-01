import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, HeartPulse, Handshake, Plus, RefreshCw, UserRound, UsersRound, X } from "lucide-react";
import type { Character } from "../../types";
import type { CharacterScheduleEntry } from "../../domain/characterLife/scheduleRuntime";
import type { Appointment } from "../../domain/schedule/scheduleTypes";
import {
  type CalendarViewItem,
  type PeriodRecord,
  type UserScheduleEntry,
  projectAppointmentCalendarItem,
  projectCharacterScheduleCalendarItem,
  projectUserScheduleCalendarItem,
} from "../../domain/schedule/calendarTypes";

interface ScheduleDashboardProps {
  userIdentityId: string;
  appointments: Appointment[];
  appointmentEntries: CalendarViewItem[];
  characterScheduleEntries: CharacterScheduleEntry[];
  userScheduleEntries: UserScheduleEntry[];
  periodRecords: PeriodRecord[];
  characters: Character[];
  onOpenChat: (characterId: string, relationId: string) => void;
  onSaveUserSchedule?: (entry: UserScheduleEntry) => boolean;
  onDeleteCalendarItem?: (item: CalendarViewItem) => boolean;
  onSavePeriodRecord?: (record: PeriodRecord) => boolean;
  onGenerateCharacterSchedule?: (input: { characterId: string; relationId?: string; range: "day" | "week" }) => Promise<{ dateKey?: string; count: number }> | { dateKey?: string; count: number };
  onClose: () => void;
}

type DashboardPage = "home" | "period" | "appointments" | "character" | "user";
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateFromKey = (key: string): Date => new Date(`${key}T00:00:00`);

const formatDate = (key?: string): string => {
  if (!key) return "待确定时间";
  const date = dateFromKey(key);
  if (Number.isNaN(date.getTime())) return "待确定时间";
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
};

const formatTime = (item: CalendarViewItem): string => {
  if (item.allDay || item.startAt === undefined) return "全天";
  const start = new Date(item.startAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (item.endAt === undefined) return start;
  return `${start} - ${new Date(item.endAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
};

const addDays = (date: Date, amount: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const buildMonthCells = (month: Date): Array<number | null> => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  return [...Array.from({ length: offset }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)];
};

const categoryLabel = (category: CalendarViewItem["category"]): string => ({
  period: "经期",
  appointment: "见面约定",
  character_schedule: "对方日程",
  user_schedule: "我的日程",
}[category]);

const categoryClass = (category: CalendarViewItem["category"]): string => ({
  period: "bg-rose-100 text-rose-700",
  appointment: "bg-amber-100 text-amber-700",
  character_schedule: "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]",
  user_schedule: "bg-sky-100 text-sky-700",
}[category]);

function CalendarItemCard({ item, characterName, onOpenChat, onLongPress }: { item: CalendarViewItem; characterName?: string; onOpenChat?: () => void; onLongPress?: () => void; key?: React.Key }) {
  const timerRef = useRef<number | null>(null);
  const clearLongPress = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const startLongPress = (event: React.PointerEvent<HTMLElement>) => {
    if (!onLongPress || (event.pointerType === "mouse" && event.button !== 0) || (event.target instanceof HTMLElement && event.target.closest("button"))) return;
    clearLongPress();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onLongPress();
    }, 560);
  };
  return (
    <article
      className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_rgba(31,35,41,0.04)] select-none"
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      onContextMenu={(event) => { event.preventDefault(); clearLongPress(); onLongPress?.(); }}
      aria-label={`${item.title}，长按删除`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${categoryClass(item.category)}`}>{categoryLabel(item.category)}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-extrabold">{item.title}</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatDate(item.dateKey)} · {formatTime(item)}</p>
          {characterName && <p className="mt-1 text-xs text-[var(--text-secondary)]">{characterName}</p>}
          {item.detail && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{item.detail}</p>}
        </div>
        {onOpenChat && <button type="button" onClick={onOpenChat} className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]" aria-label="打开关联聊天"><UsersRound className="h-4 w-4" /></button>}
      </div>
    </article>
  );
}

export default function ScheduleDashboard({
  userIdentityId,
  appointments,
  appointmentEntries,
  characterScheduleEntries,
  userScheduleEntries,
  periodRecords,
  characters,
  onOpenChat,
  onSaveUserSchedule,
  onDeleteCalendarItem,
  onSavePeriodRecord,
  onGenerateCharacterSchedule,
  onClose,
}: ScheduleDashboardProps) {
  const [page, setPage] = useState<DashboardPage>("home");
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCharacterId, setSelectedCharacterId] = useState(characters[0]?.id || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [showUserForm, setShowUserForm] = useState(false);
  const [userTitle, setUserTitle] = useState("");
  const [userDetail, setUserDetail] = useState("");
  const [userTime, setUserTime] = useState("09:00");
  const [userAllDay, setUserAllDay] = useState(false);
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalendarViewItem | null>(null);
  const currentWeekStart = useMemo(() => {
    const today = new Date();
    return addDays(today, -((today.getDay() + 6) % 7));
  }, []);
  const currentWeekEnd = useMemo(() => addDays(currentWeekStart, 6), [currentWeekStart]);
  const currentWeekStartKey = toDateKey(currentWeekStart);
  const currentWeekEndKey = toDateKey(currentWeekEnd);
  const isInCurrentWeek = (dateKey?: string): boolean => Boolean(dateKey && dateKey >= currentWeekStartKey && dateKey <= currentWeekEndKey);

  const scopedAppointments = useMemo(() => appointmentEntries.filter((item) => item.userIdentityId === userIdentityId), [appointmentEntries, userIdentityId]);
  const scopedCharacterSchedules = useMemo(() => characterScheduleEntries
    .filter((entry) => entry.userIdentityId === userIdentityId && (!selectedCharacterId || entry.characterId === selectedCharacterId))
    .map(projectCharacterScheduleCalendarItem), [characterScheduleEntries, selectedCharacterId, userIdentityId]);
  const allCharacterSchedules = useMemo(() => characterScheduleEntries
    .filter((entry) => entry.userIdentityId === userIdentityId)
    .map(projectCharacterScheduleCalendarItem), [characterScheduleEntries, userIdentityId]);
  const scopedUserSchedules = useMemo(() => userScheduleEntries
    .filter((entry) => entry.userIdentityId === userIdentityId)
    .map(projectUserScheduleCalendarItem), [userIdentityId, userScheduleEntries]);
  const scopedCharacterAppointments = useMemo(() => scopedAppointments
    .filter((item) => !selectedCharacterId || item.characterId === selectedCharacterId), [scopedAppointments, selectedCharacterId]);
  const characterCalendarItems = useMemo(() => [...scopedCharacterSchedules, ...scopedCharacterAppointments], [scopedCharacterAppointments, scopedCharacterSchedules]);
  const userCalendarItems = useMemo(() => [...scopedUserSchedules, ...scopedAppointments], [scopedAppointments, scopedUserSchedules]);
  const allItems = useMemo(() => [...scopedAppointments, ...allCharacterSchedules, ...scopedUserSchedules]
    .filter((item) => item.dateKey)
    .sort((left, right) => (left.startAt ?? Number.MAX_SAFE_INTEGER) - (right.startAt ?? Number.MAX_SAFE_INTEGER)), [allCharacterSchedules, scopedAppointments, scopedUserSchedules]);
  const nextItem = useMemo(() => {
    const now = Date.now();
    return allItems.find((item) => (item.endAt ?? item.startAt ?? now + 1) >= now) || allItems[0];
  }, [allItems]);
  const monthCells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);
  const monthYear = visibleMonth.getFullYear();
  const monthIndex = visibleMonth.getMonth();
  const selectedDayItems = allItems.filter((item) => item.dateKey === selectedDate);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(currentWeekStart, index)), [currentWeekStart]);
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId);
  const characterName = (characterId?: string) => characters.find((character) => character.id === characterId)?.remark || characters.find((character) => character.id === characterId)?.name;

  // When entering a character's calendar, land on the nearest stored item if
  // today is empty. This keeps already-generated schedules visible even when a
  // provider returned a valid future date instead of today's date.
  useEffect(() => {
    if (page !== "character" && page !== "user") return;
    if (!isInCurrentWeek(selectedDate)) {
      setSelectedDate(toDateKey(new Date()));
      return;
    }
    if (page !== "character") return;
    const datedItems = scopedCharacterSchedules.filter((item) => isInCurrentWeek(item.dateKey));
    if (datedItems.length === 0 || datedItems.some((item) => item.dateKey === selectedDate)) return;
    const now = Date.now();
    const nearest = datedItems
      .slice()
      .sort((left, right) => Math.abs(dateFromKey(left.dateKey!).getTime() - now) - Math.abs(dateFromKey(right.dateKey!).getTime() - now))[0];
    if (nearest?.dateKey) setSelectedDate(nearest.dateKey);
  }, [page, scopedCharacterSchedules, selectedCharacterId]);

  const moveMonth = (offset: number) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2600); };

  const markPeriodStart = () => {
    if (!onSavePeriodRecord) return;
    const existing = periodRecords.find((record) => record.userIdentityId === userIdentityId && !record.endDate);
    const now = Date.now();
    const record: PeriodRecord = existing
      ? { ...existing, startDate: selectedDate, updatedAt: now }
      : { id: `period-${now}`, schemaVersion: 1, userIdentityId, startDate: selectedDate, createdAt: now, updatedAt: now };
    notify(onSavePeriodRecord(record) ? "已标记经期开始" : "经期记录保存失败");
  };

  const markPeriodEnd = () => {
    if (!onSavePeriodRecord) return;
    const existing = periodRecords
      .filter((record) => record.userIdentityId === userIdentityId && !record.endDate && record.startDate <= selectedDate)
      .sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
    if (!existing) { notify("没有找到未结束的经期记录"); return; }
    notify(onSavePeriodRecord({ ...existing, endDate: selectedDate, updatedAt: Date.now() }) ? "已标记经期结束" : "经期记录保存失败");
  };

  const submitUserSchedule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = userTitle.trim();
    if (!title || !onSaveUserSchedule) return;
    const now = Date.now();
    const timestamp = userAllDay ? undefined : new Date(`${selectedDate}T${userTime || "12:00"}:00`).getTime();
    const saved = onSaveUserSchedule({
      id: `user-schedule-${now}`,
      schemaVersion: 1,
      userIdentityId,
      title,
      ...(userDetail.trim() ? { detail: userDetail.trim() } : {}),
      dateKey: selectedDate,
      ...(timestamp && !Number.isNaN(timestamp) ? { startAt: timestamp } : {}),
      ...(userAllDay ? { allDay: true } : {}),
      status: "scheduled",
      source: "manual",
      reviewState: "confirmed",
      createdAt: now,
      updatedAt: now,
    });
    notify(saved ? "已添加我的日程" : "日程保存失败");
    if (saved) {
      setUserTitle("");
      setUserDetail("");
      setShowUserForm(false);
    }
  };

  const refreshCharacterSchedule = async (range: "day" | "week") => {
    if (!onGenerateCharacterSchedule || !selectedCharacter) { notify("请先选择角色"); return; }
    setIsGenerating(true);
    try {
      const result = await onGenerateCharacterSchedule({ characterId: selectedCharacter.id, range });
      if (result.dateKey && isInCurrentWeek(result.dateKey)) setSelectedDate(result.dateKey);
      else if (result.dateKey) setSelectedDate(toDateKey(new Date()));
      notify(result.count > 0
        ? range === "day" ? `已确认当天 ${result.count} 条角色日程` : `已确认未来一周 ${result.count} 条角色日程`
        : "没有足够依据，未新增角色日程");
    } catch {
      notify("角色日程生成失败，已保留原日程");
    } finally {
      setIsGenerating(false);
    }
  };

  const renderHeader = (title: string, right?: React.ReactNode) => (
    <header className="relative flex shrink-0 items-center justify-between px-4 py-3">
      <button type="button" onClick={() => page === "home" ? onClose() : setPage("home")} className="app-nav-icon-button flex h-9 w-9 items-center justify-center" aria-label={page === "home" ? "返回桌面" : "返回日程首页"}><ChevronLeft className="h-5 w-5" /></button>
      <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-extrabold tracking-tight">{title}</h1>
      <span className="flex h-9 min-w-9 items-center justify-end">{right}</span>
    </header>
  );

  const renderMonthCalendar = (items: CalendarViewItem[], showPeriod = false) => (
    <section className="rounded-[26px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-extrabold">{monthYear}年{monthIndex + 1}月</h2>
        <div className="flex items-center gap-1"><button type="button" onClick={() => moveMonth(-1)} className="app-nav-icon-button flex h-8 w-8 items-center justify-center" aria-label="上个月"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => moveMonth(1)} className="app-nav-icon-button flex h-8 w-8 items-center justify-center" aria-label="下个月"><ChevronRight className="h-4 w-4" /></button></div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[var(--text-secondary)]">{WEEKDAY_LABELS.map((label) => <span key={label} className="py-1">{label}</span>)}</div>
      <div className="mt-2 grid grid-cols-7 gap-y-2 text-center">
        {monthCells.map((day, index) => {
          if (day === null) return <span key={`empty-${index}`} className="h-9" />;
          const dateKey = `${monthYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayItems = items.filter((item) => item.dateKey === dateKey);
          const periodHit = showPeriod && periodRecords.some((record) => record.userIdentityId === userIdentityId && record.startDate <= dateKey && (!record.endDate || record.endDate >= dateKey));
          return <button key={dateKey} type="button" onClick={() => setSelectedDate(dateKey)} aria-pressed={selectedDate === dateKey} className="relative flex h-9 items-center justify-center"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${selectedDate === dateKey ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : periodHit ? "bg-rose-100 text-rose-700" : "hover:bg-[var(--surface-raised)]"}`}>{day}</span>{dayItems.length > 0 && <span className="absolute bottom-0 flex gap-0.5" aria-hidden="true">{dayItems.slice(0, 3).map((item) => <i key={item.id} className={`h-1 w-1 rounded-full ${categoryClass(item.category).split(" ")[0].replace("bg-", "bg-")}`} />)}</span>}</button>;
        })}
      </div>
    </section>
  );

  const renderWeekStrip = () => <div className="grid grid-cols-7 gap-1 rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-2">{weekDates.map((date) => { const key = toDateKey(date); const active = key === selectedDate; const count = allItems.filter((item) => item.dateKey === key).length; return <button key={key} type="button" onClick={() => setSelectedDate(key)} className={`rounded-2xl px-1 py-2 text-center ${active ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"}`}><span className="block text-[10px]">周{WEEKDAY_LABELS[(date.getDay() + 6) % 7]}</span><span className="mt-1 block text-sm font-extrabold">{date.getDate()}</span>{count > 0 && <span className="mx-auto mt-1 block h-1 w-1 rounded-full bg-current" />}</button>; })}</div>;

  const renderTimeline = (items: CalendarViewItem[], empty: string) => {
    const selected = items.filter((item) => item.dateKey === selectedDate).sort((left, right) => (left.startAt ?? 0) - (right.startAt ?? 0));
    return selected.length === 0 ? <div className="mt-4 rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-12 text-center text-sm text-[var(--text-secondary)]">{empty}</div> : <div className="mt-4 space-y-3">{selected.map((item) => <CalendarItemCard key={item.id} item={item} characterName={characterName(item.characterId)} onOpenChat={item.characterId && item.relationId ? () => onOpenChat(item.characterId!, item.relationId!) : undefined} onLongPress={onDeleteCalendarItem ? () => setDeleteTarget(item) : undefined} />)}</div>;
  };

  const confirmDelete = () => {
    if (!deleteTarget || !onDeleteCalendarItem) return;
    const deleted = onDeleteCalendarItem(deleteTarget);
    setDeleteTarget(null);
    notify(deleted ? "已删除这条日程" : "日程删除失败，请重试");
  };

  const renderHome = () => (
    <main className="flex-1 overflow-y-auto px-4 pb-8">
      <section className="rounded-[28px] bg-[var(--surface)] p-5 shadow-[0_12px_30px_rgba(31,35,41,0.07)]">
        <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-[var(--text-secondary)]">最近一条日程</p><h2 className="mt-2 text-xl font-extrabold">{nextItem?.title || "今天还没有安排"}</h2></div><Clock3 className="h-7 w-7 text-[var(--accent)]" /></div>
        {nextItem ? <><p className="mt-3 text-sm text-[var(--text-secondary)]">{formatDate(nextItem.dateKey)} · {formatTime(nextItem)}</p>{nextItem.detail && <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{nextItem.detail}</p>}<span className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${categoryClass(nextItem.category)}`}>{categoryLabel(nextItem.category)}{characterName(nextItem.characterId) ? ` · ${characterName(nextItem.characterId)}` : ""}</span></> : <p className="mt-3 text-sm text-[var(--text-secondary)]">添加你的第一条日程，或为角色生成未来安排。</p>}
      </section>
      <section className="mt-5 grid grid-cols-2 gap-3">
        {[{ id: "period" as const, label: "经期", detail: periodRecords.filter((record) => record.userIdentityId === userIdentityId).length ? "记录与周期统计" : "还没有记录", icon: HeartPulse, className: "text-rose-500" }, { id: "appointments" as const, label: "见面约定", detail: `${scopedAppointments.length} 条安排`, icon: Handshake, className: "text-amber-500" }, { id: "character" as const, label: "对方日程", detail: `${characterCalendarItems.length} 条安排`, icon: UsersRound, className: "text-[var(--accent)]" }, { id: "user" as const, label: "我的日程", detail: `${userCalendarItems.length} 条安排`, icon: UserRound, className: "text-sky-500" }].map((card) => { const Icon = card.icon; return <button key={card.id} type="button" onClick={() => setPage(card.id)} className="min-h-36 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-sm transition-transform active:scale-[0.98]"><Icon className={`h-6 w-6 ${card.className}`} /><h3 className="mt-6 text-base font-extrabold">{card.label}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{card.detail}</p><span className="mt-3 block text-xs font-bold text-[var(--text-secondary)]">查看详情 <span aria-hidden="true">›</span></span></button>; })}
      </section>
    </main>
  );

  const renderPeriod = () => {
    const records = periodRecords.filter((record) => record.userIdentityId === userIdentityId);
    return <main className="flex-1 overflow-y-auto px-4 pb-8">{renderMonthCalendar([], true)}<section className="mt-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">{formatDate(selectedDate)}</h2><HeartPulse className="h-5 w-5 text-rose-500" /></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={markPeriodStart} className="rounded-xl bg-rose-500 px-3 py-3 text-xs font-bold text-white">经期开始</button><button type="button" onClick={markPeriodEnd} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-bold text-rose-700">经期结束</button></div></section><section className="mt-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4"><h2 className="text-sm font-extrabold">周期记录</h2>{records.length === 0 ? <p className="mt-3 text-xs text-[var(--text-secondary)]">经期记录只保存在当前身份下。</p> : <div className="mt-3 space-y-2">{records.slice().sort((left, right) => right.startDate.localeCompare(left.startDate)).map((record) => <div key={record.id} className="flex items-center justify-between rounded-xl bg-rose-50 px-3 py-3 text-xs"><span>{record.startDate} - {record.endDate || "进行中"}</span><span className="text-rose-600">{record.endDate ? `${Math.max(1, Math.round((dateFromKey(record.endDate).getTime() - dateFromKey(record.startDate).getTime()) / 86400000) + 1)} 天` : "当前"}</span></div>)}</div>}</section></main>;
  };

  const renderAppointments = () => <main className="flex-1 overflow-y-auto px-4 pb-8">{renderMonthCalendar(scopedAppointments)}<section className="mt-4"><h2 className="px-1 text-sm font-extrabold">{formatDate(selectedDate)}</h2>{renderTimeline(scopedAppointments, "这一天还没有已确认的见面约定")}</section></main>;

  const renderCharacter = () => <main className="flex-1 overflow-y-auto px-4 pb-8">{showCharacterPicker && <div className="mb-3 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm"><div className="grid gap-1">{characters.length === 0 ? <p className="px-3 py-2 text-xs text-[var(--text-secondary)]">暂无可选角色</p> : characters.map((character) => <button key={character.id} type="button" onClick={() => { setSelectedCharacterId(character.id); setShowCharacterPicker(false); }} className={`rounded-xl px-3 py-2 text-left text-xs font-bold ${selectedCharacterId === character.id ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"}`}>{character.remark || character.name}</button>)}</div></div>}{renderWeekStrip()}<div className="mt-4 flex gap-2"><button type="button" disabled={isGenerating} onClick={() => void refreshCharacterSchedule("day")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-3 py-3 text-xs font-bold text-[var(--accent-contrast)] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />生成当天</button><button type="button" disabled={isGenerating} onClick={() => void refreshCharacterSchedule("week")} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--surface)] px-3 py-3 text-xs font-bold text-[var(--accent)] disabled:opacity-50">生成一周</button></div>{renderTimeline(characterCalendarItems, "角色今天还没有日程")}</main>;

  const renderUser = () => <main className="flex-1 overflow-y-auto px-4 pb-8">{renderWeekStrip()}<div className="mt-4 flex items-center justify-between"><h2 className="text-sm font-extrabold">{formatDate(selectedDate)}</h2><span className="text-xs text-[var(--text-secondary)]">我的日程</span></div>{showUserForm && <form onSubmit={submitUserSchedule} className="mt-3 rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-extrabold">添加我的日程</h3><button type="button" onClick={() => setShowUserForm(false)} aria-label="关闭"><X className="h-4 w-4" /></button></div><input value={userTitle} onChange={(event) => setUserTitle(event.target.value)} placeholder="日程名称" className="mt-3 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-3 text-sm outline-none" required /><input value={userDetail} onChange={(event) => setUserDetail(event.target.value)} placeholder="备注（可选）" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-3 text-sm outline-none" /><div className="mt-2 flex items-center gap-3"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={userAllDay} onChange={(event) => setUserAllDay(event.target.checked)} />全天</label>{!userAllDay && <input type="time" value={userTime} onChange={(event) => setUserTime(event.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-3 text-xs" />}</div><button type="submit" className="mt-3 w-full rounded-xl bg-[var(--accent)] px-3 py-3 text-xs font-bold text-[var(--accent-contrast)]">保存日程</button></form>}{renderTimeline(userCalendarItems, "今天还没有我的日程")}<button type="button" onClick={() => setShowUserForm((current) => !current)} aria-label={showUserForm ? "关闭添加日程" : "添加日程"} className="absolute bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_24px_color-mix(in_srgb,var(--accent)_32%,transparent)] transition-transform active:scale-95">{showUserForm ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}</button></main>;

  const title = page === "home" ? "日程" : page === "period" ? "经期" : page === "appointments" ? "见面约定" : page === "character" ? "对方日程" : "我的日程";
  const characterSwitcher = page === "character" ? <div className="relative"><button type="button" onClick={() => setShowCharacterPicker((current) => !current)} aria-expanded={showCharacterPicker} aria-label="切换角色" className="flex max-w-28 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-primary)]"><UserRound className="h-3.5 w-3.5 text-[var(--accent)]" /><span className="truncate">{selectedCharacter?.remark || selectedCharacter?.name || "选择人物"}</span><ChevronDown className="h-3 w-3 text-[var(--text-secondary)]" /></button></div> : undefined;
  return <div className="relative flex h-full flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
    {renderHeader(title, characterSwitcher)}
    {page === "home" ? renderHome() : page === "period" ? renderPeriod() : page === "appointments" ? renderAppointments() : page === "character" ? renderCharacter() : renderUser()}
    {notice && <div role="status" className="pointer-events-none absolute bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-lg">{notice}</div>}
    {deleteTarget && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 px-5 backdrop-blur-[2px]" role="presentation" onClick={() => setDeleteTarget(null)}>
      <div className="w-full max-w-[320px] overflow-hidden rounded-[14px] bg-[var(--surface)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="schedule-delete-title" onClick={(event) => event.stopPropagation()}>
        <div className="px-6 pb-5 pt-6 text-center">
          <h2 id="schedule-delete-title" className="text-base font-extrabold text-[var(--text-primary)]">删除日程？</h2>
          <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">删除后，这条日程将从日程和相关页面移除。</p>
        </div>
        <div className="grid grid-cols-2 border-t border-[var(--border)]">
          <button type="button" onClick={() => setDeleteTarget(null)} className="py-3.5 text-sm text-[var(--text-secondary)]">取消</button>
          <button type="button" onClick={confirmDelete} className="border-l border-[var(--border)] py-3.5 text-sm font-semibold text-rose-500">删除</button>
        </div>
      </div>
    </div>}
  </div>;
}
