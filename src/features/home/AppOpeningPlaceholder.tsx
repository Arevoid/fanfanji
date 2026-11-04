import { useEffect, useState } from "react";

/** Reserve the app's navigation and content area without flashing a spinner. */
export function AppOpeningPlaceholder() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 900); return () => clearTimeout(timer); }, []);
  return <div className="app-opening-placeholder h-full bg-[var(--app-bg)] text-[var(--text-secondary)]" role="status" aria-live="polite">
    <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-5"><span className="h-4 w-4 rounded bg-current opacity-10"/><span className="h-3 w-20 rounded bg-current opacity-10"/><span className="h-4 w-4 rounded bg-current opacity-10"/></div>
    <div className="space-y-4 p-5 opacity-[.06]" aria-hidden="true"><div className="h-10 rounded-xl bg-current"/><div className="h-24 rounded-2xl bg-current"/><div className="h-24 rounded-2xl bg-current"/></div>
    <span className="block text-center text-xs">{slow ? "正在打开…" : <span className="sr-only">准备应用</span>}</span>
    {slow && <button type="button" className="mx-auto mt-6 block rounded-full border border-[var(--border)] px-4 py-2 text-xs" onClick={() => window.dispatchEvent(new Event("app-opening-cancel"))}>返回桌面</button>}
  </div>;
}
