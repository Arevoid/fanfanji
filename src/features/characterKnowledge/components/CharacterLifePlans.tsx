import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { projectLifePlans } from "../../../domain/memory/lifePlanProjection";
import { getCharacterLifeEpisodes } from "../services/characterContinuityService";

/** Both schedule surfaces read the same owner-scoped life records. No generation on viewing. */
export function CharacterLifePlans({ userIdentityId, characterId }: { userIdentityId: string; characterId: string }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    const timer = window.setInterval(update, 5000);
    window.addEventListener("focus", update);
    window.addEventListener("storage", update);
    document.addEventListener("fanfanji:life-advance-result", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("storage", update); document.removeEventListener("fanfanji:life-advance-result", update); };
  }, []);
  const plans = projectLifePlans(getCharacterLifeEpisodes(), userIdentityId, characterId);
  if (!plans.length) return null;
  return <section aria-label="生活计划" className="my-4 space-y-3">
    <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4" />生活计划</h2>
    {plans.map(plan => <article key={plan.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
      <p className="whitespace-pre-wrap leading-6">{plan.summary}</p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{plan.scheduleSlot
        ? `${new Date(plan.scheduleSlot.startAt).toLocaleString("zh-CN")} — ${new Date(plan.scheduleSlot.endAt).toLocaleString("zh-CN")}${plan.scheduleSlot.location ? ` · ${plan.scheduleSlot.location}` : ""}`
        : "时间待定"}</p>
      {plan.activity && <details className="mt-3 text-xs leading-6 text-[var(--text-secondary)]"><summary className="cursor-pointer">查看进展</summary>
        <p>{plan.activity.goal}</p><p>进度 {plan.activity.progress}/{plan.activity.steps.length}</p>
        <p>下一步：{plan.activity.steps[plan.activity.progress] || "等待后续进展"}</p>
      </details>}
    </article>)}
  </section>;
}
