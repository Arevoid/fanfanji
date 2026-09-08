import type {
  AppointmentActor,
  AppointmentProposal,
  AppointmentTimePrecision,
  ScheduleEntry,
  ScheduleEntryStatus,
} from "../../domain/schedule/scheduleTypes";

export type ScheduleFilter = "upcoming" | "active" | "history" | "all";

export const SCHEDULE_FILTERS: ReadonlyArray<{ id: ScheduleFilter; label: string }> = [
  { id: "upcoming", label: "待见面" },
  { id: "active", label: "进行中" },
  { id: "history", label: "历史" },
  { id: "all", label: "全部" },
];

export const SCHEDULE_STATUS_META: Record<ScheduleEntryStatus, { label: string; dotClass: string; badgeClass: string }> = {
  confirmed: { label: "已确认", dotClass: "bg-sky-500", badgeClass: "bg-sky-50 text-sky-700 dark:bg-sky-950/45 dark:text-sky-200" },
  preparing: { label: "准备见面", dotClass: "bg-amber-500", badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-950/45 dark:text-amber-200" },
  ready: { label: "可以见面", dotClass: "bg-orange-500", badgeClass: "bg-orange-50 text-orange-700 dark:bg-orange-950/45 dark:text-orange-200" },
  in_progress: { label: "进行中", dotClass: "bg-emerald-500", badgeClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-200" },
  completed: { label: "已完成", dotClass: "bg-emerald-500", badgeClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-200" },
  cancelled: { label: "已取消", dotClass: "bg-stone-400", badgeClass: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" },
  expired: { label: "已过期", dotClass: "bg-stone-400", badgeClass: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" },
};

const PERIOD_LABELS: Record<AppointmentTimePrecision, string> = {
  exact: "",
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
  date_only: "全天",
  undetermined: "时间待定",
};

const ACTOR_LABELS: Record<AppointmentActor, string> = {
  character: "对方前往",
  user: "你前往",
  both: "双方前往",
  undetermined: "行程待定",
};

export const formatScheduleDate = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return dateKey;
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${month}月${day}日 ${weekday}`;
};

export const formatScheduleTime = (entry: Pick<ScheduleEntry, "startAt" | "timePrecision">): string => {
  if (entry.startAt === undefined) return PERIOD_LABELS[entry.timePrecision];
  if (entry.timePrecision !== "exact") return PERIOD_LABELS[entry.timePrecision];
  return new Date(entry.startAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
};

export const formatProposalSummary = (proposal: AppointmentProposal): string => {
  const pieces: string[] = [];
  if (proposal.startAt !== undefined) {
    const date = new Date(proposal.startAt);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    pieces.push(formatScheduleDate(dateKey), proposal.timePrecision === "exact"
      ? date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
      : PERIOD_LABELS[proposal.timePrecision]);
  } else {
    pieces.push(PERIOD_LABELS[proposal.timePrecision]);
  }
  if (proposal.activity) pieces.push(proposal.activity);
  if (proposal.location) pieces.push(proposal.location);
  pieces.push(ACTOR_LABELS[proposal.traveler]);
  if (proposal.transport) pieces.push(proposal.transport);
  return pieces.filter(Boolean).join(" · ");
};

export const filterScheduleEntries = (entries: readonly ScheduleEntry[], filter: ScheduleFilter): ScheduleEntry[] => {
  if (filter === "all") return [...entries];
  if (filter === "upcoming") return entries.filter((entry) => entry.status === "confirmed" || entry.status === "preparing" || entry.status === "ready");
  if (filter === "active") return entries.filter((entry) => entry.status === "in_progress");
  return entries.filter((entry) => entry.status === "completed" || entry.status === "cancelled" || entry.status === "expired");
};
