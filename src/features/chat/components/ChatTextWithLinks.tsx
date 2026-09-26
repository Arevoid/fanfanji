import React from "react";

const CHAT_URL_PATTERN = /https?:\/\/[^\s<>"'“”‘’]+/giu;
const TRAILING_URL_PUNCTUATION = /[，。！？；：、）》】\]}>'"”’]+$/u;

function normalizeUrl(raw: string): { url: string; trailing: string } {
  const url = raw.replace(TRAILING_URL_PUNCTUATION, "");
  return { url, trailing: raw.slice(url.length) };
}

export function ChatTextWithLinks({ text }: { text: string }): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(CHAT_URL_PATTERN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const { url, trailing } = normalizeUrl(raw);
    if (!url) continue;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <a
        key={`chat-link-${key += 1}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="chat-message-link break-words underline decoration-current/50 underline-offset-2 hover:decoration-current"
        style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {url}
      </a>,
    );
    if (trailing) parts.push(trailing);
    cursor = index + raw.length;
  }

  if (cursor === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

