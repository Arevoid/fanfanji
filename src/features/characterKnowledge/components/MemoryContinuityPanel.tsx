import {confirmMemoryPersistence} from '../services/memoryManagementService';
import { isLifeExperience } from "../../../domain/memory/lifePlanProjection";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Edit3, MoreVertical, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { MemoryAutoLoad } from "./MemoryAutoLoad";
import { MemoryLifeCard } from "./MemoryLifeCard";
import { impressionChangeEntries, impressionDisplayText } from "./memoryImpressionPresentation";
import type { Character, MemoryItem } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { deleteCharacterImpression, deleteCharacterLife, editCharacterLifeSummary, editCharacterImpression, getCharacterContinuityView, pauseCharacterImpression } from "../services/characterContinuityService";
import { lifePublicRevision,setLifePublicSharing } from "../services/publicLifeSharingService";

export type MemoryView = "memories" | "impressions" | "changes";
export function MemoryContinuityPanel(props: {
  characters: Character[]; relationships: CharacterRelationship[]; memories: MemoryItem[]; claims: KnowledgeClaim[];
  identityId: string; characterId: string; relationId: string; query: string;
  view: MemoryView; onView: (view: MemoryView) => void; onSaveMemories: (memories: MemoryItem[]) => void;
  showNavigation?:boolean;
  contentMode?:"life"|"changes";
  formatRecordedAt?: (timestamp: number) => string;
  lifeMemoryCards?: { id: string; time: number; card: ReactNode }[];
  settings?: import("../../../types").UserSettings;
}) {
  const [revision, refresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState("");
  const [impressionMenu, setImpressionMenu] = useState<string>();
  const impressionMenuRoot = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!impressionMenu) return;
    const outside = (event: PointerEvent) => { if (!impressionMenuRoot.current?.contains(event.target as Node)) setImpressionMenu(undefined); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setImpressionMenu(undefined); impressionMenuRoot.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [impressionMenu]);
  useEffect(() => setImpressionMenu(undefined), [props.view, props.contentMode, props.query, props.characterId, props.relationId, props.identityId]);
  const [deleting, setDeleting] = useState<{ kind: "impression" | "life"; id: string }>();
  const [editingLife, setEditingLife] = useState<string>(); const [actionError, setActionError] = useState("");
  const lifeEditDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [visibleCount, setVisibleCount] = useState(30);
  useEffect(() => setVisibleCount(30), [props.view, props.contentMode, props.query, props.characterId, props.relationId, props.identityId]);
  const editDialog = useRef<HTMLDialogElement>(null);
  const store = getCharacterContinuityView();
  const owned = (identityId: string, characterId: string, relationId?: string) => identityId === props.identityId
    && (props.characterId === "all" || props.characterId === characterId)
    && (props.relationId === "all" || relationId === undefined || props.relationId === relationId);
  const matches = (text: string) => text.toLocaleLowerCase().includes(props.query.trim().toLocaleLowerCase());
  const impressions = store.value.impressions.filter((record) => owned(record.scope.userIdentityId, record.scope.characterId, record.scope.relationId)
    && record.status === "active" && !record.resolvedById && matches(record.proposition)).sort((a, b) => b.recordedAt - a.recordedAt);
  const life = store.value.life.filter((record) => owned(record.userIdentityId, record.characterId) && matches(record.summary));
  const impressionChanges = impressionChangeEntries(impressions, store.value.impressions);
  const visibleLife=life.filter(episode=>isLifeExperience(episode) && (props.contentMode!=="changes"||episode.previousEpisodeId));
  const extraLifeCards = props.contentMode === "life" ? props.lifeMemoryCards || [] : [];
  const timelineCount=visibleLife.length+extraLifeCards.length;
  useEffect(() => { const timer = setInterval(() => refresh((value) => value + 1), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (editing) editDialog.current?.showModal(); else editDialog.current?.close();
  }, [editing]);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); else deleteDialog.current?.close(); }, [deleting]);
  useEffect(() => { if (editingLife) lifeEditDialog.current?.showModal(); else lifeEditDialog.current?.close(); }, [editingLife]);
  useEffect(() => setActionError(""), [deleting, editingLife]);
  const button = "min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  return <section aria-label="角色记忆与成长" className="space-y-3 text-sm text-slate-800">
    {props.showNavigation!==false&&<div className="grid grid-cols-3 gap-2" aria-label="记忆视图">
      {([['memories', 'TA 记住了什么'], ['impressions', 'TA 如何看待你'], ['changes', 'TA的经历']] as const).map(([view, label]) =>
        <button type="button" key={view} aria-pressed={props.view === view} onClick={() => props.onView(view)}
          className={`${button} ${props.view === view ? 'bg-slate-900 text-white' : 'bg-white'}`}>{label}</button>)}
    </div>}
    {!store.valid && <p role="alert">成长记录暂时无法安全读取，原数据未改变。</p>}
    {notice && <p role="status">{notice}</p>}
    {props.view === "impressions" && <div className="space-y-3">
      <p className="memory-impression-intro">相处中，TA慢慢有了这些印象，也可能看错。</p>
      {!impressions.length && <p className="memory-impression-intro">还没有留下新的印象，慢慢相处就好。</p>}
      {impressions.slice(0, visibleCount).map((record) => <article key={record.id} ref={impressionMenu === record.id ? impressionMenuRoot : undefined} className="memory-content-card memory-impression-card">
        <header className="memory-card-header">
          <div className="min-w-0"><p className="memory-card-author">{props.characters.find((character) => character.id === record.scope.characterId)?.name || "TA"}眼中的你</p>
            <p className="memory-card-time">整理于 {new Date(record.recordedAt).toLocaleString("zh-CN")}</p></div>
          <button type="button" className="memory-card-control memory-card-more" aria-label="更多认识操作" aria-expanded={impressionMenu === record.id} onClick={() => setImpressionMenu(impressionMenu === record.id ? undefined : record.id)}><MoreVertical aria-hidden="true" className="h-4 w-4" /></button>
        </header>
        {impressionMenu === record.id && <div className="memory-card-menu" aria-label="认识操作">
          <button type="button" className="memory-card-menu-item" onClick={() => { setImpressionMenu(undefined); setEditing(record.id); setDraft(record.proposition); }}><Edit3 aria-hidden="true" className="h-4 w-4" />纠正认识</button>
          <button type="button" className="memory-card-menu-item" onClick={async () => { const result = (await confirmMemoryPersistence(pauseCharacterImpression(record.id, record.scope, !record.paused)));
            setImpressionMenu(undefined); setNotice(result.success ? record.paused ? "已恢复使用这份印象" : "已暂停使用这份印象" : "保存失败，原状态未改变"); refresh(value => value + 1);
          }}>{record.paused ? <PlayCircle aria-hidden="true" className="h-4 w-4" /> : <PauseCircle aria-hidden="true" className="h-4 w-4" />}{record.paused ? "恢复使用" : "暂停使用"}</button>
          <button type="button" className="memory-card-menu-item memory-card-danger" onClick={() => { setImpressionMenu(undefined); setDeleting({ kind: "impression", id: record.id }); }}><Trash2 aria-hidden="true" className="h-4 w-4" />删除认识</button>
        </div>}
        <p className="memory-impression-prose">{impressionDisplayText(record.proposition)}</p>
        {impressionChanges.find(entry => entry.id === record.id) && <details className="memory-impression-evidence"><summary>这份认识是怎么变的</summary>
          <p className="my-2 whitespace-pre-wrap leading-7">{impressionChanges.find(entry => entry.id === record.id)!.text}</p>
        </details>}
        {record.paused && <p className="memory-card-time">已暂停，这份印象暂时不会影响聊天。</p>}
        <details className="memory-impression-evidence"><summary>为什么这样想</summary>
          {record.sourceClaimIds.map((id) => <p key={id} className="my-2 whitespace-pre-wrap break-words">{props.claims.find((claim) => claim.id === id)?.statement || "这段经历的来源已不可用"}</p>)}
          {record.revisionReason && <p className="my-2 whitespace-pre-wrap break-words">{record.revisionReason}</p>}
          {record.intervention && <p className="my-2">你曾纠正过这份印象。</p>}
        </details>
      </article>)}
    </div>}
    {props.view === "changes" && <div className="space-y-3">
      <p className="memory-impression-intro">有些经历，会让TA留下感触，也慢慢认识自己。</p>
      {!timelineCount && <p>{props.contentMode==="life"?"暂时没有自己的生活经历。":"还没有留下前后变化的记录。"}</p>}
      {props.contentMode === "life" && <h2 className="pl-1 text-xs text-slate-400">TA的经历 ({timelineCount})</h2>}
      {[
        ...visibleLife.map(episode => ({ id: `life:${episode.id}`, time: episode.recordedAt, card: <MemoryLifeCard episode={episode}
          characterName={props.characters.find(character => character.id === episode.characterId)?.name || "TA"}
          organizedTime={props.formatRecordedAt?.(episode.recordedAt) || new Date(episode.recordedAt).toLocaleString("zh-CN")}
          sharingAllowed={episode.publicSharing?.revision === lifePublicRevision(episode)}
          onEdit={() => { setDraft(episode.summary); setEditingLife(episode.id); }}
          onDelete={() => setDeleting({ kind: "life", id: episode.id })}
          onSharing={async () => { const allowed = episode.publicSharing?.revision === lifePublicRevision(episode);
            const result = (await confirmMemoryPersistence(setLifePublicSharing(episode.id, episode.characterId, episode.userIdentityId, !allowed)));
            setNotice(result.success ? allowed ? "已撤销公开许可，已发布的动态保留" : "已允许这条生活用于公开动态" : "保存失败，原公开许可不变"); refresh(value => value + 1);
          }} /> })),
        ...extraLifeCards,
      ].sort((a,b) => b.time-a.time || a.id.localeCompare(b.id)).slice(0,visibleCount).map(entry => <div key={entry.id}>{entry.card}</div>)}
    </div>}
    {(props.view === "impressions" || props.view === "changes") && <MemoryAutoLoad count={visibleCount} total={props.view === "impressions" ? impressions.length : timelineCount} onLoad={() => setVisibleCount(count => count + 30)} />}

    <dialog ref={editDialog} onCancel={() => setEditing(undefined)} aria-labelledby="memory-impression-edit-title"
      className="w-[min(90vw,420px)] rounded-2xl p-6 text-slate-900 backdrop:bg-black/40">
      <h2 id="memory-impression-edit-title" className="text-lg font-semibold">纠正角色的认识</h2>
      <p className="my-3">直接修改将标记为用户干预，过去的认识仍保留。</p>
      <label htmlFor="impression-content">修改内容</label><textarea id="impression-content" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={400} className="my-2 min-h-28 w-full rounded-lg border p-3" />
      <div className="flex gap-2"><button className={button} disabled={!draft.trim()} onClick={async () => {
        const record = impressions.find((item) => item.id === editing); if (!record) return;
        const result = (await confirmMemoryPersistence(editCharacterImpression(record, draft)));
        if (result.success) { setEditing(undefined); refresh(revision + 1); } else setNotice("纠正保存失败，原记录保留");
      }}>保存纠正</button><button className={button} onClick={() => setEditing(undefined)}>取消</button></div>
    </dialog>
    <dialog ref={deleteDialog} onCancel={() => setDeleting(undefined)} aria-labelledby="memory-continuity-delete-title"
      className="w-[min(90vw,420px)] rounded-2xl p-6 text-slate-900 backdrop:bg-black/40">
      <h2 id="memory-continuity-delete-title" className="text-lg font-semibold">{deleting?.kind === "life" ? "删除生活记录" : "删除角色认识"}</h2>
      <p className="my-3">{deleting?.kind === "life" ? "有持续目标时会同时删除该目标的全部推进记录，并重新计算生活状态与参与者知情。" : "删除后停止使用这条认识，同一批旧证据不会自动重建它；新的经历仍可形成新的认识。"}</p>
      {actionError && <p role="alert" className="my-2">{actionError}</p>}
      <div className="flex flex-wrap gap-2"><button className={button} onClick={async () => {
        if (!deleting) return;
        const impression = impressions.find((record) => record.id === deleting.id);
        const episode = life.find((record) => record.id === deleting.id);
        const result = deleting.kind === "impression" && impression ? (await confirmMemoryPersistence(deleteCharacterImpression(impression.id, impression.scope)))
          : deleting.kind === "life" && episode ? (await confirmMemoryPersistence(deleteCharacterLife(episode.id, episode.characterId, episode.userIdentityId))) : undefined;
        if (result?.success) { setDeleting(undefined); setNotice("已删除，相关状态已更新"); refresh((value) => value + 1); }
        else setActionError("删除未保存，原记录保留，请重试");
      }}>确认删除</button><button autoFocus className={button} onClick={() => setDeleting(undefined)}>取消</button></div>
    </dialog>
    <dialog ref={lifeEditDialog} onCancel={() => setEditingLife(undefined)} aria-labelledby="memory-life-edit-title"
      className="w-[min(90vw,420px)] rounded-2xl p-6 text-slate-900 backdrop:bg-black/40">
      <h2 id="memory-life-edit-title" className="text-lg font-semibold">纠正生活描述</h2>
      <p className="my-3">保留纠正历史，不改变目标步骤、进度和参与者。目标描述须保留目标名称；目标或进度有误时，请删除该目标及推进记录。</p>
      <label htmlFor="life-summary-content">生活描述</label><textarea id="life-summary-content" className="my-2 min-h-28 w-full rounded-lg border p-3"
        value={draft} maxLength={400} onChange={(event) => setDraft(event.target.value)} />
      {actionError && <p role="alert" className="my-2">{actionError}</p>}
      <div className="flex flex-wrap gap-2"><button className={button} disabled={!draft.trim()} onClick={async () => {
        const record = life.find((item) => item.id === editingLife); if (!record) return;
        const result = (await confirmMemoryPersistence(editCharacterLifeSummary(record.id, record.characterId, record.userIdentityId, draft)));
        if (result.success) { setEditingLife(undefined); setNotice("生活描述已纠正，历史保留"); refresh((value) => value + 1); }
        else setActionError("保存失败；描述需保留目标名称，且不能添加用户或私聊事件。原记录保留。");
      }}>保存描述</button><button className={button} onClick={() => setEditingLife(undefined)}>取消</button></div>
    </dialog>
  </section>;
}
