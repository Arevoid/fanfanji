import React from "react";
import { detectErrorPage, getErrorPageMessage } from "../../../utils/errorPageDetection";

const INLINE_MARKDOWN_PATTERN = /(!?\[[^\]]*\]\(https?:\/\/[^\s)]+\)|\(https?:\/\/mcp\.yoww2026\.cn\/i\/[^\s)]+\)|\*\*[^*]+\*\*|__[^_]+__|\x60[^\x60]+\x60|\*[^*]+\*|_[^_]+_|https?:\/\/[^\s<>"']+)/giu;
const TRAILING_URL_PUNCTUATION = /[.,!?;:)\]}>'"，。！？；：、）》】]+$/u;
const LEGACY_MCP_MEDIA_TAIL_PATTERN = /^(?:\(?\.(?:gif|png|jpe?g)\)?|[a-z0-9+/=_-]{1,96}\.(?:gif|png|jpe?g)\))$/iu;

export function isLegacyMcpMediaFragment(text: string): boolean {
  return LEGACY_MCP_MEDIA_TAIL_PATTERN.test(text.trim());
}
function normalizeUrl(raw: string): { url: string; trailing: string } {
  const url = raw.replace(TRAILING_URL_PUNCTUATION, "");
  return { url, trailing: raw.slice(url.length) };
}
function renderImage(url: string, alt: string, key: string): React.ReactElement {
  const isMcpSticker = /https?:\/\/mcp\.yoww2026\.cn\/i\//iu.test(url);
  return <a key={key} href={url} target="_blank" rel="noopener noreferrer" className={`chat-message-image-link inline-flex max-w-full align-top ${isMcpSticker ? "h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-xl bg-[var(--media-placeholder-bg)]" : ""}`} aria-label={alt} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
    <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={(event) => { event.currentTarget.style.display = "none"; }} className={`chat-message--image cursor-zoom-in object-contain shadow-sm ${isMcpSticker ? "h-full w-full rounded-xl" : "max-h-[220px] max-w-full rounded-lg bg-stone-100"}`} />
  </a>;
}
function renderLink(url: string, label: string, key: string): React.ReactElement {
  return <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="chat-message-link break-words underline decoration-current/50 underline-offset-2 hover:decoration-current" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>{label}</a>;
}
function renderInline(text: string, nextKey: () => string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE_MARKDOWN_PATTERN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    if (raw.startsWith("(") && /^\(https?:\/\/mcp\.yoww2026\.cn\/i\/[^\s)]+\)$/iu.test(raw)) {
      nodes.push(renderImage(raw.slice(1, -1), "sticker", nextKey()));
    } else if (raw.startsWith("![") || raw.startsWith("[")) {
      const parsed = raw.match(/^!?\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/iu);
      if (parsed) nodes.push(raw.startsWith("![") ? renderImage(parsed[2], parsed[1] || "image", nextKey()) : renderLink(parsed[2], parsed[1] || parsed[2], nextKey()));
      else nodes.push(raw);
    } else if (raw.startsWith("**") || raw.startsWith("__")) nodes.push(<strong key={nextKey()}>{raw.slice(2, -2)}</strong>);
    else if (raw.startsWith("*") || raw.startsWith("_")) nodes.push(<em key={nextKey()}>{raw.slice(1, -1)}</em>);
    else if (raw.charCodeAt(0) === 96) nodes.push(<code key={nextKey()} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em]">{raw.slice(1, -1)}</code>);
    else if (/^https?:\/\/mcp\.yoww2026\.cn\/i\//iu.test(raw)) {
      const normalized = normalizeUrl(raw);
      nodes.push(renderImage(normalized.url, "sticker", nextKey()));
      if (normalized.trailing) nodes.push(normalized.trailing);
    } else {
      const normalized = normalizeUrl(raw);
      nodes.push(renderLink(normalized.url, normalized.url, nextKey()));
      if (normalized.trailing) nodes.push(normalized.trailing);
    }
    cursor = index + raw.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length ? nodes : [text];
}
function renderBlocks(text: string): React.ReactNode {
  const lines = text.split(/\r?\n/u);
  if (lines.length === 1 && !/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>)/u.test(text)) {
    let inlineKey = 0;
    return <>{renderInline(text, () => "inline-" + (++inlineKey))}</>;
  }
  const nodes: React.ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let key = 0;
  const nextKey = () => "md-" + (++key);
  const flushCode = () => {
    if (!codeLines.length) return;
    nodes.push(<pre key={nextKey()} className="my-1 overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs"><code>{codeLines.join("\n")}</code></pre>);
    codeLines = [];
  };
  lines.forEach((line, index) => {
    if (/^\s*\x60\x60\x60/u.test(line)) {
      if (inCode) flushCode();
      inCode = !inCode;
      return;
    }
    if (inCode) { codeLines.push(line); return; }
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/u);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/u);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/u);
    const quote = line.match(/^\s*>\s?(.*)$/u);
    const children = heading ? renderInline(heading[2], nextKey) : bullet ? renderInline(bullet[1], nextKey) : ordered ? renderInline(ordered[1], nextKey) : quote ? renderInline(quote[1], nextKey) : renderInline(line, nextKey);
    if (heading) nodes.push(React.createElement("h" + Math.min(6, heading[1].length), { key: nextKey(), className: "my-1 font-bold" }, children));
    else if (bullet) nodes.push(<div key={nextKey()} className="ml-4 list-item list-disc">{children}</div>);
    else if (ordered) nodes.push(<div key={nextKey()} className="ml-4 list-item list-decimal">{children}</div>);
    else if (quote) nodes.push(<blockquote key={nextKey()} className="border-l-2 border-slate-300 pl-2 text-slate-500">{children}</blockquote>);
    else if (line.trim()) nodes.push(<div key={nextKey()}>{children}</div>);
    else if (index < lines.length - 1) nodes.push(<br key={nextKey()} />);
  });
  if (inCode) flushCode();
  return <>{nodes}</>;
}
export function ChatTextWithLinks({ text }: { text: string }): React.ReactNode {
  const errorPage = detectErrorPage(text);
  if (errorPage) {
    return <span role="status" className="text-amber-700">{getErrorPageMessage(errorPage)}</span>;
  }
  return renderBlocks(text);
}
