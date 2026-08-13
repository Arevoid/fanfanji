import React, { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronUp, LoaderCircle, Send, X } from "lucide-react";
import type { ReadingStoryChoice } from "../../domain/reading/storyTypes";

export interface ReadingStoryPanel {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
}

interface ReadingStoryPlayShellProps {
  title: string;
  subtitle: string;
  currentChapter: number;
  targetChapters: number;
  currentLocation: string;
  currentTime: string;
  statusLabel: string;
  choices: ReadingStoryChoice[];
  action: string;
  actionPlaceholder: string;
  submitLabel: string;
  busy?: boolean;
  submitDisabled?: boolean;
  notice?: string | null;
  panels: ReadingStoryPanel[];
  headerAction?: ReactNode;
  children: ReactNode;
  onActionChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function ReadingStoryPlayShell(props: ReadingStoryPlayShellProps) {
  const [choicesExpanded, setChoicesExpanded] = useState(true);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const activePanel = props.panels.find((item) => item.id === activePanelId);
  const progress = props.targetChapters > 0 ? Math.min(100, Math.max(0, (props.currentChapter / props.targetChapters) * 100)) : 0;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [props.notice]);

  return (
    <div data-theme-page="reading-story-play" className="relative flex h-full flex-col overflow-hidden bg-[#0c0b0a] text-[#eee8df]">
      <header className="relative z-30 flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0c0b0a]/95 px-3 py-2 backdrop-blur">
        <button type="button" onClick={props.onBack} aria-label="退出故事" className="flex h-9 w-9 items-center justify-center rounded-full text-[#eee8df]"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1 px-2 text-center">
          <h1 className="truncate text-sm font-bold tracking-wide">{props.title}</h1>
          <p className="mt-0.5 truncate text-[10px] text-white/50">{props.subtitle}</p>
        </div>
        <div className="flex h-9 min-w-9 items-center justify-end">{props.headerAction}</div>
      </header>

      <div className="relative z-20 h-1 shrink-0 bg-white/5"><div className="h-full bg-amber-400/80 transition-all" style={{ width: `${progress}%` }} /></div>

      <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-56 pt-5">
        <div className="mx-auto max-w-2xl">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-[10px] text-white/45">
            <span className="rounded-full border border-white/10 px-2.5 py-1">第 {props.currentChapter}/{props.targetChapters} 章</span>
            <span className="rounded-full border border-white/10 px-2.5 py-1">{props.currentLocation}</span>
            <span className="rounded-full border border-white/10 px-2.5 py-1">{props.currentTime}</span>
            <span className="ml-auto text-amber-300/75">{props.statusLabel}</span>
          </div>
          {props.notice && <div role="status" className="mb-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-50/80">{props.notice}</div>}
          {props.children}
        </div>
      </main>

      <aside aria-label="故事快捷面板" className="absolute right-3 top-24 z-30 flex flex-col gap-2">
        {props.panels.map((panel) => <button key={panel.id} type="button" onClick={() => setActivePanelId(panel.id)} className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-[#26221f]/95 px-3 text-[11px] font-bold shadow-lg backdrop-blur"><span className="text-amber-300">{panel.icon}</span>{panel.label}</button>)}
      </aside>

      <section aria-label="故事行动区" className="absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#12100e]/97 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_35px_rgba(0,0,0,0.4)] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          {props.choices.length > 0 && <div className="mb-3">
            <button type="button" onClick={() => setChoicesExpanded((value) => !value)} aria-expanded={choicesExpanded} className="flex h-10 w-full items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/5 px-3 text-left text-xs font-bold text-amber-100">
              <span>下一步怎么走 · {props.choices.length} 个选项</span>{choicesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            {choicesExpanded && <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">{props.choices.map((choice, index) => <button key={choice.id} type="button" onClick={() => { props.onActionChange(choice.label); setChoicesExpanded(false); }} className={`w-full rounded-2xl border px-4 py-3 text-left text-xs leading-5 transition ${props.action === choice.label ? "border-amber-300 bg-amber-400/15" : "border-amber-500/25 bg-black/20"}`}><span className="mr-2 font-black text-amber-300">[{choice.id?.toUpperCase() || String.fromCharCode(65 + index)}]</span>{choice.label}{choice.consequenceHint && <span className="mt-1 block pl-6 text-[10px] text-white/40">{choice.consequenceHint}</span>}</button>)}</div>}
          </div>}
          <div className="flex items-end gap-2">
            <textarea value={props.action} onChange={(event) => props.onActionChange(event.target.value)} disabled={props.busy} rows={2} placeholder={props.actionPlaceholder} className="min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-5 text-[#eee8df] outline-none placeholder:text-white/25 focus:border-amber-300/50 disabled:opacity-50" />
            <button type="button" onClick={props.onSubmit} disabled={props.submitDisabled || props.busy} aria-label={props.submitLabel} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-600 text-amber-50 disabled:opacity-35">{props.busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button>
          </div>
          <p className="mt-1.5 px-1 text-[9px] text-white/30">{props.busy ? "故事正在生成并保存，请稍候…" : props.submitLabel}</p>
        </div>
      </section>

      {activePanel && <div className="absolute inset-0 z-50 flex items-end bg-black/65" onClick={() => setActivePanelId(null)} role="presentation"><section role="dialog" aria-modal="true" aria-label={activePanel.label} onClick={(event) => event.stopPropagation()} className="max-h-[72%] w-full overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#1b1816] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"><div className="mx-auto max-w-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-base font-black">{activePanel.label}</h2><button type="button" onClick={() => setActivePanelId(null)} aria-label="关闭面板" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5"><X className="h-4 w-4" /></button></div>{activePanel.content}</div></section></div>}
    </div>
  );
}
