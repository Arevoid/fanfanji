import { useEffect, useRef, useState } from "react";
import { dismissLegacyOfflineReminder, LEGACY_OFFLINE_REMINDER, shouldShowLegacyOfflineReminder } from "../services/legacyMemoryCompatibilityNoticeService";

export function LegacyMemoryCompatibilityNotice() {
  const [open, setOpen] = useState(shouldShowLegacyOfflineReminder);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open) dialog.current?.close(); }, [open]);
  useEffect(() => {
    const update = () => setOpen(shouldShowLegacyOfflineReminder());
    window.addEventListener("storage", update);
    document.addEventListener("fanfanji:memory-data-updated", update);
    return () => { window.removeEventListener("storage", update); document.removeEventListener("fanfanji:memory-data-updated", update); };
  }, []);
  const close = () => {
    if (!dismissLegacyOfflineReminder()) { setError("关闭状态未能保存，请重试。"); return; }
    setOpen(false);
    document.dispatchEvent(new Event("fanfanji:memory-data-updated"));
  };
  return <dialog ref={dialog} aria-labelledby="legacy-offline-reminder-title" onCancel={event => { event.preventDefault(); close(); }}
    className="memory-legacy-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(90vw,420px)] overflow-y-auto rounded-2xl p-5 backdrop:bg-black/40">
    <h2 id="legacy-offline-reminder-title" className="text-base font-semibold">提醒</h2>
    <p className="mt-4 text-sm leading-7">{LEGACY_OFFLINE_REMINDER}</p>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    <button type="button" autoFocus className="mt-4 min-h-11 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm text-white" onClick={close}>知道了</button>
  </dialog>;
}
