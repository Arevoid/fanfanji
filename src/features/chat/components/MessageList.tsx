import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { Message } from "../../../types";
import { MessageItem } from "./MessageItem";

export const DEFAULT_MESSAGE_RENDER_WINDOW_SIZE = 50;
interface ViewSnapshot { loadedId?: string; anchorId?: string; offset: number; atEnd: boolean; heights: Map<string, number> }
const snapshots = new Map<string, ViewSnapshot>();
export const hasChatViewportSnapshot = (key: string) => snapshots.has(key);
interface MessageListProps {
  key?: string; messages: readonly Message[]; scrollRef: RefObject<HTMLDivElement | null>;
  className: string; style: CSSProperties; renderMessage: (message: Message, index: number) => ReactNode;
  children: ReactNode; header?: ReactNode; contentClassName?: string; renderWindowSize?: number;
  conversationKey?: string; jumpToMessage?: { id: string; requestId: number };
  onJumpHandled?: () => void;
  /** Long-form offline replies begin at their opening paragraph instead of their end. */
  newReplyPosition?: "bottom" | "start";
}
const lowerBound = (offsets: readonly number[], offset: number) => {
  let low = 0, high = offsets.length - 1;
  while (low < high) { const mid = (low + high + 1) >>> 1; if (offsets[mid] <= offset) low = mid; else high = mid - 1; } return low;
};
/** Explicit history batches + measured bounded DOM. Business records stay intact. */
export function MessageList({ messages, scrollRef, className, style, renderMessage, children, header, contentClassName,
  renderWindowSize, conversationKey, jumpToMessage, onJumpHandled, newReplyPosition = "bottom" }: MessageListProps) {
  const pageSize = Number.isFinite(renderWindowSize) ? Math.max(1, Math.min(200, Math.floor(renderWindowSize!))) : DEFAULT_MESSAGE_RENDER_WINDOW_SIZE;
  const initial = useRef(conversationKey ? snapshots.get(conversationKey) : undefined);
  const index = useMemo(() => new Map(messages.map((message, i) => [message.id, i])), [messages]);
  const initialStart = initial.current?.loadedId ? index.get(initial.current.loadedId) : undefined;
  const [loadedStart, setLoadedStart] = useState(initialStart ?? Math.max(0, messages.length - pageSize));
  const [range, setRange] = useState(() => {
    const anchor = initial.current?.anchorId ? index.get(initial.current.anchorId) : undefined;
    const start = anchor === undefined ? Math.max(0, messages.length - pageSize) : Math.max(0, anchor - pageSize);
    return { start, end: Math.min(messages.length, start + pageSize * 3) };
  });
  const [measurement, setMeasurement] = useState(0), [newCount, setNewCount] = useState(0), [highlight, setHighlight] = useState<string>();
  const [awayFromEnd, setAwayFromEnd] = useState(initial.current?.atEnd === false);
  const heights = useRef(initial.current?.heights || new Map<string, number>());
  const content = useRef<HTMLDivElement>(null), heading = useRef<HTMLDivElement>(null);
  const atEnd = useRef(initial.current?.atEnd ?? true);
  const anchor = useRef<{ id?: string; offset: number }>({ id: initial.current?.anchorId, offset: initial.current?.offset || 0 });
  const pending = useRef<{ id?: string; offset: number; bottom?: boolean }>();
  const handledJump = useRef<number>();
  const previousPageSize = useRef(pageSize);
  const previous = useRef({ length: messages.length, lastId: messages.at(-1)?.id, loadedId: messages[loadedStart]?.id });
  const previousMessages = useRef(messages);
  const latest = useRef({ loadedStart, messages }); latest.current = { loadedStart, messages };
  const getRows = (): HTMLElement[] => Array.from(content.current?.querySelectorAll("[data-chat-message-id]") || []) as HTMLElement[];
  const offsets = useMemo(() => {
    const result = [0]; for (const message of messages) result.push(result.at(-1)! + (heights.current.get(message.id) ?? 76)); return result;
  }, [messages, measurement]);
  const start = Math.min(Math.max(loadedStart, range.start), Math.max(0, messages.length - 1));
  const end = Math.min(messages.length, Math.max(start + 1, range.end));
  const rememberAnchor = () => {
    const container = scrollRef.current; if (!container) return;
    atEnd.current = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    const top = container.getBoundingClientRect().top;
    const first = getRows().find(row => row.getBoundingClientRect().bottom > top + 1);
    if (first) anchor.current = { id: first.dataset.chatMessageId, offset: first.getBoundingClientRect().top - top };
  };
  const fitWindow = () => {
    const container = scrollRef.current; if (!container) return;
    rememberAnchor();
    setAwayFromEnd(!atEnd.current);
    const relative = Math.max(0, container.scrollTop - (heading.current?.offsetHeight || 0)) + offsets[loadedStart];
    const visible = Math.min(messages.length - 1, lowerBound(offsets, relative));
    const nextStart = Math.max(loadedStart, visible - pageSize), nextEnd = Math.min(messages.length, Math.max(loadedStart, visible - pageSize) + pageSize * 3);
    setRange(old => old.start === nextStart && old.end === nextEnd ? old : { start: nextStart, end: nextEnd });
    if (atEnd.current) setNewCount(0);
  };
  const goLatest = () => {
    atEnd.current = true; pending.current = { offset: 0, bottom: true }; setNewCount(0); setAwayFromEnd(false);
    setRange({ start: Math.max(loadedStart, messages.length - pageSize), end: messages.length });
    requestAnimationFrame(() => { const container = scrollRef.current; if (container) container.scrollTop = container.scrollHeight; });
  };
  useLayoutEffect(() => {
    const old = previous.current, last = messages.at(-1);
    const oldIds = new Set(previousMessages.current.map(message => message.id));
    const firstNewReply = newReplyPosition === "start"
      ? messages.find(message => message.sender === "character" && !oldIds.has(message.id))
      : undefined;
    if (!old.length && messages.length) setLoadedStart(Math.max(0, messages.length - pageSize));
    if (old.loadedId && index.has(old.loadedId)) setLoadedStart(index.get(old.loadedId)!);
    else if (loadedStart > Math.max(0, messages.length - 1)) setLoadedStart(Math.max(0, messages.length - pageSize));
    if (firstNewReply && atEnd.current && !jumpToMessage) {
      const position = index.get(firstNewReply.id)!;
      atEnd.current = false; setAwayFromEnd(true); setNewCount(0);
      anchor.current = { id: firstNewReply.id, offset: 16 };
      pending.current = { ...anchor.current };
      setRange({ start: Math.max(loadedStart, position - pageSize), end: Math.min(messages.length, position + pageSize * 2) });
    } else if (old.lastId !== last?.id && messages.length > old.length) {
      if (atEnd.current || last?.sender === "user") goLatest();
      else { setNewCount(count => count + messages.length - old.length); pending.current = { ...anchor.current }; }
    } else if (atEnd.current && newReplyPosition === "bottom" && !jumpToMessage) {
      // Streaming, translation and media can grow an existing message without
      // changing its ID or the message count. Keep a following reader pinned.
      pending.current = { offset: 0, bottom: true };
    } else if (old.length !== messages.length && !atEnd.current) pending.current = { ...anchor.current };
    previous.current = { length: messages.length, lastId: last?.id, loadedId: messages[loadedStart]?.id };
    previousMessages.current = messages;
  }, [messages, pageSize, newReplyPosition]);
  useLayoutEffect(() => {
    if (!jumpToMessage) return;
    const position = index.get(jumpToMessage.id); if (position === undefined) return;
    atEnd.current = false; setAwayFromEnd(true);
    const nextLoaded = Math.min(loadedStart, Math.max(0, position - pageSize));
    previous.current.loadedId = messages[nextLoaded]?.id;
    setLoadedStart(nextLoaded);
    setRange({ start: Math.max(0, position - pageSize), end: Math.min(messages.length, position + pageSize * 2) });
    pending.current = { id: jumpToMessage.id, offset: (scrollRef.current?.clientHeight || 400) / 3 }; setHighlight(jumpToMessage.id);
  }, [jumpToMessage?.requestId, jumpToMessage?.id]);
  useEffect(() => { if (!highlight) return; const timer = setTimeout(() => setHighlight(undefined), 2500); return () => clearTimeout(timer); }, [highlight]);
  useLayoutEffect(() => {
    const container = scrollRef.current; if (!container) return;
    const restore = pending.current;
    if (restore?.bottom) { container.scrollTop = container.scrollHeight; pending.current = undefined; }
    else if (restore?.id) {
      const row = getRows().find(item => item.dataset.chatMessageId === restore.id);
      if (row) { container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top - restore.offset; pending.current = undefined;
        if (jumpToMessage?.id === restore.id && handledJump.current !== jumpToMessage.requestId) { handledJump.current = jumpToMessage.requestId; onJumpHandled?.(); } }
    }
    const rows = getRows(); let frame = 0;
    const measure = () => {
      frame = 0; let changed = false;
      // Loading indicators and late media layout can change content height
      // without adding a row. Follow those changes only for bottom readers.
      if (atEnd.current && newReplyPosition === "bottom" && !jumpToMessage) container.scrollTop = container.scrollHeight;
      for (const row of rows) { const height = row.getBoundingClientRect().height, id = row.dataset.chatMessageId!;
        if (height > 0 && Math.abs((heights.current.get(id) ?? 76) - height) > 1) { heights.current.set(id, height); changed = true; } }
      if (changed) { pending.current = atEnd.current ? { offset: 0, bottom: true } : { ...anchor.current }; setMeasurement(value => value + 1); }
    }; measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(measure); });
    rows.forEach(row => observer?.observe(row));
    if (content.current) observer?.observe(content.current);
    return () => { observer?.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [start, end, messages, measurement, newReplyPosition, jumpToMessage]);
  useLayoutEffect(() => {
    if (!jumpToMessage) pending.current = initial.current && !initial.current.atEnd ? { id: initial.current.anchorId, offset: initial.current.offset } : { offset: 0, bottom: true };
    setMeasurement(value => value + 1);
    return () => {
      if (!conversationKey) return; const state = latest.current;
      snapshots.delete(conversationKey); snapshots.set(conversationKey, { loadedId: state.messages[state.loadedStart]?.id, anchorId: anchor.current.id,
        offset: anchor.current.offset, atEnd: atEnd.current, heights: heights.current });
      while (snapshots.size > 10) snapshots.delete(snapshots.keys().next().value!);
    };
  }, []);
  useLayoutEffect(() => {
    if (previousPageSize.current === pageSize) return;
    previousPageSize.current = pageSize;
    if (atEnd.current) {
      const next = Math.max(0, messages.length - pageSize);
      previous.current.loadedId = messages[next]?.id; setLoadedStart(next);
      setRange({ start: next, end: messages.length }); pending.current = { offset: 0, bottom: true };
    } else { pending.current = { ...anchor.current }; fitWindow(); }
  }, [pageSize]);
  return <div ref={scrollRef} className={className} style={{ ...style, overflowAnchor: "none" }} onScroll={fitWindow}>
    <div ref={content} className={contentClassName}>
      <div ref={heading}>{header}{loadedStart > 0 && <button type="button" className="mx-auto my-3 block rounded-full bg-[var(--surface-raised)] px-2.5 py-0.5 text-[11.5px] font-normal text-[var(--text-secondary)]"
        onClick={() => { rememberAnchor(); atEnd.current = false; setAwayFromEnd(true); pending.current = { ...anchor.current }; const next = Math.max(0, loadedStart - pageSize); setLoadedStart(next);
          previous.current.loadedId = messages[next]?.id; setRange({ start: next, end: Math.min(messages.length, next + pageSize * 3) }); }}>查看更早的消息（还有 {loadedStart} 条）</button>}</div>
      <div aria-hidden="true" style={{ height: Math.max(0, offsets[start] - offsets[loadedStart]) }} />
      {messages.slice(start, end).map((message, local) => <div key={message.id} data-chat-message-id={message.id} className="chat-message-window-row"
        style={{ display: "flow-root", outline: message.id === highlight ? "2px solid var(--button-primary-bg)" : undefined, outlineOffset: "2px", borderRadius: "8px" }}>
        <MessageItem message={message} index={start + local} render={renderMessage} />
      </div>)}
      <div aria-hidden="true" style={{ height: Math.max(0, offsets[messages.length] - offsets[end]) }} />{children}
    </div>
    {(awayFromEnd || newCount > 0) && <button type="button" onClick={goLatest} className="sticky bottom-2 ml-auto block h-[22px] rounded-full bg-[var(--button-primary-bg)] px-2 text-[10px] text-[var(--button-primary-text)]">{newCount > 0 ? `有 ${newCount} 条新消息，查看最新` : "回到最新消息"}</button>}
  </div>;
}
