import React, { useEffect, useMemo, useState } from "react";
import { clearPromptDebugSnapshots, listPromptDebugSnapshots, subscribePromptDebugSnapshots } from "../../../domain/prompt/promptDebugRegistry";

export function PromptDebugPanel() {
  const [snapshots, setSnapshots] = useState(listPromptDebugSnapshots);
  const [selectedId, setSelectedId] = useState<string | null>(() => snapshots.at(-1)?.id || null);
  useEffect(() => subscribePromptDebugSnapshots(() => setSnapshots(listPromptDebugSnapshots())), []);
  useEffect(() => {
    if (!snapshots.some((snapshot) => snapshot.id === selectedId)) setSelectedId(snapshots.at(-1)?.id || null);
  }, [selectedId, snapshots]);
  const selected = useMemo(() => snapshots.find((snapshot) => snapshot.id === selectedId) || snapshots.at(-1), [selectedId, snapshots]);
  return <div className="space-y-4 p-4 text-left" data-prompt-debug-panel>
    <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">仅保留当前页面生命周期内最近 20 次组装结果；刷新即清空，不写入本地数据，也不进入备份。</div>
    <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-700">已捕获 {snapshots.length} 次</span><button type="button" onClick={clearPromptDebugSnapshots} className="rounded-[12px] bg-slate-900 px-3 py-2 text-[11px] font-bold text-white">清空</button></div>
    {!selected ? <div className="rounded-[16px] border border-dashed border-slate-300 p-8 text-center text-xs text-slate-400">生成一次聊天、日记或故事后，这里会显示最终提示词。</div> : <>
      <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="w-full rounded-[12px] border border-slate-200 bg-white p-3 text-xs">{[...snapshots].reverse().map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{new Date(snapshot.createdAt).toLocaleTimeString()} · {snapshot.scenario}</option>)}</select>
      <DebugSection title="指定深度注入诊断" value={JSON.stringify(selected.historyInjections, null, 2)} />
      <DebugSection title={`聊天历史 (${selected.history.length})`} value={JSON.stringify(selected.history, null, 2)} />
      <DebugSection title="系统提示词" value={selected.systemInstruction} />
      <DebugSection title="当前任务消息" value={selected.message} />
    </>}
  </div>;
}

function DebugSection({ title, value }: { title: string; value: string }) {
  return <details className="rounded-[16px] border border-slate-200 bg-white p-3" open={title.includes("诊断")}><summary className="cursor-pointer text-xs font-bold text-slate-700">{title}</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-slate-950 p-3 text-[10px] leading-relaxed text-emerald-300">{value || "(空)"}</pre></details>;
}
