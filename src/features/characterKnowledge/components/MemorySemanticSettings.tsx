import { useEffect, useRef, useState, type ReactNode } from "react";
import { Database, Eye, EyeOff, RefreshCw, X } from "lucide-react";
import type { MemoryEmbeddingConfiguration } from "../services/memoryEmbeddingProvider";
import { fetchMemoryVectorModels, normalizeMemoryVectorConfiguration } from "../services/memoryVectorSettingsService";

export function MemorySemanticSettings(props: { configuration?: MemoryEmbeddingConfiguration;
  onSave: (configuration: MemoryEmbeddingConfiguration) => void; onClose?: () => void; progress?:ReactNode }) {
  const [draft, setDraft] = useState<MemoryEmbeddingConfiguration>(() => props.configuration || { enabled: false, apiEndpoint: "", model: "", apiKey: "", minimumSimilarity: 0.5 });
  const [notice, setNotice] = useState(""); const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false); const [showKey, setShowKey] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const generation = useRef(0);
  useEffect(() => { dialog.current?.showModal(); return () => { generation.current++; dialog.current?.close(); }; }, []);
  const update = (patch: Partial<MemoryEmbeddingConfiguration>) => {
    generation.current++; setFetching(false); setDraft((value) => ({ ...value, ...patch })); setNotice("");
    if (patch.apiEndpoint !== undefined || patch.apiKey !== undefined) setModels([]);
  };
  const fetchModels = async () => {
    const version = ++generation.current; setFetching(true); setNotice("");
    try {
      const found = await fetchMemoryVectorModels(draft);
      if (version !== generation.current) return;
      setModels(found); setNotice(`已拉取 ${found.length} 个模型，请选择支持向量的模型。`);
    } catch (error) { if (version === generation.current) setNotice(error instanceof Error ? error.message : "拉取失败，请重试或手动填写模型。"); }
    finally { if (version === generation.current) setFetching(false); }
  };
  const input = "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--app-bg)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2";
  return <dialog ref={dialog} onCancel={() => props.onClose?.()} aria-labelledby="memory-vector-title"
    className="m-auto h-[min(460px,85dvh)] w-[calc(100%_-_32px)] max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text-primary)] shadow-xl backdrop:bg-black/45">
    <form className="flex h-full min-h-0 flex-col" onSubmit={(event) => {
      event.preventDefault();
      try { props.onSave(normalizeMemoryVectorConfiguration(draft)); setNotice("配置已更新。"); props.onClose?.(); }
      catch (error) { setNotice(error instanceof Error ? error.message : "配置未保存，请检查填写内容。"); }
    }}>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <h2 id="memory-vector-title" className="flex items-center gap-2 text-sm font-bold"><Database className="h-4 w-4" aria-hidden="true" />向量记忆</h2>
        <button type="button" aria-label="关闭向量记忆" onClick={() => props.onClose?.()} className="flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline"><X className="h-4 w-4" /></button>
      </header>
      <div data-vector-scroll className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <label className="block text-xs">向量 URL<input aria-label="向量 URL" type="url" placeholder="https://api.example.com/v1" autoComplete="off" value={draft.apiEndpoint} maxLength={500} onChange={(event) => update({ apiEndpoint: event.target.value })} className={input} /></label>
        <label className="block text-xs">API Key<span className="relative block"><input aria-label="API Key" type={showKey ? "text" : "password"} autoComplete="new-password" value={draft.apiKey} maxLength={300} onChange={(event) => update({ apiKey: event.target.value })} className={`${input} pr-12`} />
          <button type="button" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} onClick={() => setShowKey(!showKey)} className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline">{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
        <div><div className="flex items-center justify-between gap-2"><label htmlFor="memory-vector-model" className="text-xs">模型选择</label>
          <button type="button" disabled={fetching} onClick={() => void fetchModels()} className="flex min-h-11 items-center gap-1 text-xs disabled:opacity-50 focus-visible:outline"><RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${fetching ? 'animate-spin motion-reduce:animate-none' : ''}`} />{fetching ? "拉取中…" : "拉取模型列表"}</button></div>
          {models.length > 0 && !manualModel ? <select id="memory-vector-model" value={draft.model} onChange={(event) => {
            if (event.target.value === "__manual__") { setManualModel(true); return; } update({ model: event.target.value });
          }} className={input}>
            <option value="">选择向量模型</option>
            {draft.model && !models.includes(draft.model) && <option value={draft.model}>{draft.model}</option>}
            {models.map((model) => <option key={model} value={model}>{model}</option>)}
            <option value="__manual__">手动填写模型名</option>
          </select> : <input id="memory-vector-model" placeholder="填写或选择向量模型" value={draft.model} maxLength={160} onChange={(event) => update({ model: event.target.value })} className={input} />}
        </div>
        <details><summary className="min-h-11 cursor-pointer text-xs">索引进度与用量</summary>
          <p className="my-2 text-xs leading-5">向量是可选增强。未配置、暂停或达到预算时，仍使用本地记忆检索。配置保存不代表全库索引完成。预算按角色与用户身份每日计算，索引与查询共用字符预算。</p>
          {props.progress}
          <label className="mt-3 block text-xs">每日索引请求上限<input type="number" min={1} max={10000} value={draft.indexRequestsPerDay??64} onChange={event=>update({indexRequestsPerDay:Number(event.target.value)})} className={input}/></label>
          <label className="mt-3 block text-xs">每日查询请求上限<input type="number" min={1} max={10000} value={draft.queryRequestsPerDay??128} onChange={event=>update({queryRequestsPerDay:Number(event.target.value)})} className={input}/></label>
          <label className="mt-3 block text-xs">每日向量字符上限<input type="number" min={1} max={100000000} value={draft.charactersPerDay??2000000} onChange={event=>update({charactersPerDay:Number(event.target.value)})} className={input}/></label>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={draft.indexPaused===true} onChange={event=>update({indexPaused:event.target.checked})}/>暂停补齐索引，保留已有索引供查询</label>
        </details>
        {notice && <p role="status" className="break-words text-xs leading-5">{notice}</p>}
      </div>
      <footer className="flex shrink-0 gap-3 border-t border-[var(--border)] p-4">
        {props.configuration?.enabled && <button type="button" className="min-h-11 rounded-xl border border-[var(--border)] px-3 text-sm focus-visible:outline" onClick={() => {
          try { props.onSave({ ...props.configuration!, enabled: false }); props.onClose?.(); setNotice("向量记忆已停用。"); }
          catch { setNotice("停用未保存，请重试。"); }
        }}>停用</button>}
        <button type="submit" className="min-h-11 min-w-0 flex-1 rounded-xl bg-neutral-950 px-4 font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">确认并应用</button>
      </footer>
    </form>
  </dialog>;
}
