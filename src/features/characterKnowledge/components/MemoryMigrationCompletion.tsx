import { useEffect, useRef, useState } from "react";
import { readMemorySystem } from "../../../core/storage/repositories/memorySystemRepository";
import { consumeMemoryMigrationNotice, memoryMigrationNoticeText } from "../services/memoryMigrationFinalization";

/** App-shell owned: leaving the memory page neither cancels work nor loses its result. */
export function MemoryMigrationCompletion() {
  const [state, setState] = useState(() => readMemorySystem());
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const open = state.valid && state.value.migrationFinished && state.value.migrationNoticePending;
  useEffect(() => {
    const update = () => setState(readMemorySystem());
    document.addEventListener("fanfanji:memory-migration-finished", update);
    document.addEventListener("fanfanji:memory-data-updated", update);
    window.addEventListener("storage", update);
    update();
    return () => { document.removeEventListener("fanfanji:memory-migration-finished", update); document.removeEventListener("fanfanji:memory-data-updated", update); window.removeEventListener("storage", update); };
  }, []);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open) dialog.current?.close(); }, [open]);
  const close = () => {
    if (!consumeMemoryMigrationNotice()) { setError("关闭状态未能保存，请重试；记忆内容不受影响。"); return; }
    setError(""); setState(readMemorySystem());
  };
  return <div data-theme-page="memory"><dialog ref={dialog} aria-labelledby="memory-migration-result-title" onCancel={event => { event.preventDefault(); close(); }}
    className="memory-legacy-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(90vw,420px)] overflow-y-auto rounded-2xl p-5 backdrop:bg-black/40">
    <h2 id="memory-migration-result-title">旧记忆处理结果</h2>
    <p className="mt-4 text-sm leading-7">{open ? memoryMigrationNoticeText() : ""}</p>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    <button type="button" autoFocus className="mt-4 min-h-11 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm text-white" onClick={close}>知道了</button>
  </dialog></div>;
}
