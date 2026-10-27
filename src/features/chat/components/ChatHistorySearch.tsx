import { useEffect, useMemo, useRef, useState } from "react";
import type { Message, OfflineStory } from "../../../types";
import { buildChatHistoryCandidates, CHAT_HISTORY_CATEGORIES, searchChatHistory, type ChatHistoryCategory, type ChatHistoryResult, type ChatHistoryScope } from "../services/chatHistorySearch";

export interface ChatHistorySearchState { query: string; category: ChatHistoryCategory; pages: number; scrollTop: number }
export const emptyChatHistorySearchState = (): ChatHistorySearchState => ({ query: "", category: "all", pages: 1, scrollTop: 0 });
function excerpt(text: string, query: string): string {
  const position = query.trim() ? text.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase()) : 0;
  const start = Math.max(0, position - 35); return `${start ? "…" : ""}${text.slice(start, start + 180)}${text.length > start + 180 ? "…" : ""}`;
}
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim(), start = needle ? text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()) : -1;
  if (start < 0) return <>{text}</>;
  return <>{text.slice(0, start)}<mark>{text.slice(start, start + needle.length)}</mark>{text.slice(start + needle.length)}</>;
}
export function ChatHistorySearch({ messages, stories, scope, state, onStateChange, onSelect, characterName }: {
  messages: readonly Message[]; stories: readonly OfflineStory[]; scope: ChatHistoryScope; state: ChatHistorySearchState;
  onStateChange: (state: ChatHistorySearchState) => void; onSelect: (result: ChatHistoryResult) => void; characterName: string;
}) {
  const candidates = useMemo(() => buildChatHistoryCandidates(messages, stories, scope), [messages, stories, scope.characterId, scope.relationId, scope.conversationId, scope.userIdentityId, scope.group]);
  const [results, setResults] = useState<ChatHistoryResult[]>([]), [busy, setBusy] = useState(false), [hasMore, setHasMore] = useState(false), [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null), restored = useRef(false), scrollPosition = useRef(state.scrollTop);
  const latest = useRef({ state, onStateChange }); latest.current = { state, onStateChange };
  const pageCache = useRef<{ candidates: typeof candidates; filter: string; pages: Map<number, Awaited<ReturnType<typeof searchChatHistory>>> }>({ candidates, filter: "", pages: new Map() });
  useEffect(() => () => { const current = latest.current; current.onStateChange({ ...current.state, scrollTop: scrollPosition.current }); }, []);
  const update = (patch: Partial<ChatHistorySearchState>) => { if (scroller.current) scroller.current.scrollTop = 0; scrollPosition.current = 0; onStateChange({ ...state, ...patch, pages: 1, scrollTop: 0 }); };
  useEffect(() => {
    const abort = new AbortController(); setBusy(true); setError("");
    const timer = setTimeout(() => { void (async () => {
      try {
        const filter = JSON.stringify([state.query, state.category]);
        if (pageCache.current.candidates !== candidates || pageCache.current.filter !== filter) pageCache.current = { candidates, filter, pages: new Map() };
        const cache = pageCache.current.pages;
        const collected: ChatHistoryResult[] = []; let cursor: { timestamp: number; key: string } | undefined, more = false;
        for (let page = 0; page < state.pages; page++) {
          const answer = cache.get(page) || await searchChatHistory(candidates, { query: state.query, category: state.category, before: cursor, signal: abort.signal, limit: 50 });
          if (abort.signal.aborted) return;
          cache.set(page, answer);
          collected.splice(0, collected.length, ...answer.results); more = answer.hasMore; cursor = answer.cursor; if (!more) break;
        }
        if (!abort.signal.aborted) { setResults(collected); setHasMore(more); setBusy(false);
          if (!restored.current) requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = state.scrollTop; restored.current = true; }); }
      } catch (failure) { if (!abort.signal.aborted) { setError("查找失败，请修改条件后重试。"); setBusy(false); } }
    })(); }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [candidates, state.query, state.category, state.pages]);
  return <section aria-label="查找聊天记录" className="flex min-h-0 flex-col gap-3">
    <div className="sticky top-0 z-10 space-y-3 bg-[var(--surface)] pb-2">
      <label className="block text-sm"><span className="sr-only">搜索聊天记录</span><input aria-label="搜索聊天记录" type="search" placeholder="搜索当前聊天记录" value={state.query} onChange={event => update({ query: event.target.value })}
        className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm" /></label>
      <div role="group" aria-label="聊天记录分类" className="grid grid-cols-6 gap-1">{CHAT_HISTORY_CATEGORIES.map(item => <button key={item.id} type="button" aria-pressed={state.category === item.id} onClick={() => update({ category: item.id })}
        className={`h-8 min-w-0 whitespace-nowrap rounded-full border border-[var(--border)] px-1 text-xs ${state.category === item.id ? "bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" : "bg-[var(--surface)] text-[var(--text-primary)]"}`}>{item.label}</button>)}</div>
    </div>
    <div ref={scroller} className="max-h-[55dvh] min-h-0 overflow-y-auto" onScroll={event => { scrollPosition.current = event.currentTarget.scrollTop; }}>
      <p role="status" className="mb-2 text-xs text-[var(--text-secondary)]">{busy ? "正在查找…" : error || (results.length ? `第 ${state.pages} 页，显示 ${results.length} 条${hasMore ? "，可继续查看" : ""}` : "没有找到匹配的聊天记录")}</p>
      {results.map(result => <button type="button" disabled={busy} key={result.key} data-chat-history-result={result.key} onClick={() => { onStateChange({ ...state, scrollTop: scrollPosition.current }); onSelect(result); }} className="mb-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left">
        <span className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--text-secondary)]"><span>{result.storyId ? `线下 · ${result.title || "剧情"}` : result.sender === "user" ? "你" : characterName}</span><time>{new Date(result.timestamp).toLocaleString("zh-CN")}</time></span>
        <span className="block whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-primary)]"><Highlight text={excerpt(result.text, state.query)} query={state.query} /></span>
      </button>)}
      {!busy && state.pages > 1 && <button type="button" onClick={() => { if (scroller.current) scroller.current.scrollTop = 0; onStateChange({ ...state, pages: state.pages - 1, scrollTop: 0 }); }} className="min-h-11 w-full rounded-xl border border-[var(--border)] px-4 text-sm">上一页</button>}
      {!busy && hasMore && <button type="button" onClick={() => { if (scroller.current) scroller.current.scrollTop = 0; onStateChange({ ...state, pages: state.pages + 1, scrollTop: 0 }); }} className="min-h-11 w-full rounded-xl border border-[var(--border)] px-4 text-sm">查看更多结果</button>}
    </div>
  </section>;
}
