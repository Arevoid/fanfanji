import { useEffect, useRef, useState } from "react";
import { Edit3, MoreVertical, Trash2 } from "lucide-react";
import type { CharacterLifeEpisode } from "../../../domain/memory/characterContinuity";

export function MemoryLifeCard(props: {
  episode: CharacterLifeEpisode; characterName: string; organizedTime: string; sharingAllowed: boolean;
  onEdit: () => void; onDelete: () => void; onSharing: () => void;
}) {
  const { episode } = props;
  const [details, setDetails] = useState(false);
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenu(false); root.current?.querySelector<HTMLButtonElement>('button[aria-label="更多生活操作"]')?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [menu]);
  const planned = episode.status !== "completed";
  const label = episode.supersededById ? "过去的计划" : episode.status === "cancelled" ? "已取消的计划" : planned ? "生活计划" : "生活经历";
  return <article ref={root} className="memory-content-card relative">
    <header className="memory-card-header">
      <div className="min-w-0"><p className="memory-card-author">{props.characterName}</p><p className="memory-card-time">整理于 {props.organizedTime}</p></div>
      <div className="memory-card-actions">
        <button type="button" className="memory-card-control" aria-expanded={details} onClick={() => setDetails(!details)}>详情</button>
        <button type="button" className="memory-card-control memory-card-more" aria-label="更多生活操作" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreVertical aria-hidden="true" className="h-4 w-4" /></button>
      </div>
    </header>
    {menu && <div className="memory-card-menu" aria-label="生活操作">
      <button type="button" className="memory-card-menu-item" onClick={() => { setMenu(false); props.onEdit(); }}><Edit3 aria-hidden="true" className="h-4 w-4" />编辑生活描述</button>
      <button type="button" className="memory-card-menu-item memory-card-danger" onClick={() => { setMenu(false); props.onDelete(); }}><Trash2 aria-hidden="true" className="h-4 w-4" />{episode.activity ? "删除目标及记录" : "删除生活经历"}</button>
    </div>}
    <h3 className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold leading-6">{episode.experience?.reflection || episode.summary}</h3>
    {planned && <p className="memory-card-time">{episode.status === "cancelled" ? "这项计划已取消。" : episode.supersededById ? "已有后续记录，这里保留之前的计划。" : "还在计划中，尚未发生。"}</p>}
    {details && <div className="memory-life-details">
      {episode.activity && <><p>正在做：{episode.activity.goal}</p><p>进度：{episode.activity.progress}/{episode.activity.steps.length}</p>
        {episode.status === "planned" && !episode.supersededById && <p>下一步：{episode.activity.steps[episode.activity.progress] || "等待后续进展"}</p>}
        <p>{episode.activity.energy >= .7 ? "精力充足" : episode.activity.energy <= .3 ? "有些疲惫" : "精力尚可"} · {episode.activity.stress >= .7 ? "压力较大" : episode.activity.stress <= .3 ? "心情较放松" : "有些事情挂心"}</p>
        {episode.activity.friction && <p>挂心的事：{episode.activity.friction}</p>}</>}
      {episode.scheduleSlot && <p>{planned ? "计划时段" : "模拟时段"}：{new Date(episode.scheduleSlot.startAt).toLocaleString()} — {new Date(episode.scheduleSlot.endAt).toLocaleString()}{episode.scheduleSlot.location ? ` · ${episode.scheduleSlot.location}` : ""}</p>}
      {!planned && !episode.supersededById && <button type="button" role="switch" aria-label="允许生活用于公开动态" aria-checked={props.sharingAllowed} className="memory-recall-switch" onClick={props.onSharing}><span>允许用于公开动态</span><span className="memory-recall-track" aria-hidden="true"><span /></span></button>}

      {episode.summaryHistory?.length ? <details><summary className="min-h-11 cursor-pointer py-3">描述修改历史</summary>{episode.summaryHistory.map((item, index) => <p key={index}>{new Date(item.editedAt).toLocaleString()}：{item.text}</p>)}</details> : null}
      {!episode.activity && !episode.scheduleSlot && <p>这是TA自己生活中保留的一段记录。</p>}
    </div>}
    <footer className="memory-card-categories"><span className="memory-card-category">{label}</span></footer>
  </article>;
}
