import type { ReactNode } from "react";

export type BerryGridIconId =
  | "character-phone"
  | "chat"
  | "archives"
  | "worldbook"
  | "music"
  | "forum"
  | "store"
  | "notes"
  | "diary"
  | "memory"
  | "offline"
  | "schedule"
  | "reading"
  | "cinema"
  | "relationship-network"
  | "settings";

const iconFrame = (className: string, children: ReactNode) => (
  <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {children}
  </svg>
);

/** Solid, self-contained glyphs for the Berry Grid desktop preset. */
export function BerryGridIcon({ id, className = "h-8 w-8" }: { id: BerryGridIconId; className?: string }) {
  const white = "#fffdfc";
  switch (id) {
    case "character-phone":
      return iconFrame(className, <>
        <rect x="6" y="2.5" width="12" height="19" rx="3.2" fill="currentColor" />
        <rect x="8.1" y="5" width="7.8" height="12.2" rx="1.4" fill={white} opacity=".92" />
        <circle cx="12" cy="19.2" r="1" fill={white} />
      </>);
    case "chat":
      return iconFrame(className, <>
        <path d="M4 4h16a2 2 0 0 1 2 2v8.3a2 2 0 0 1-2 2H9l-4.8 3.2c-.5.35-1.2-.02-1.2-.63V6a2 2 0 0 1 2-2Z" fill="currentColor" />
        <circle cx="8" cy="10.5" r="1.1" fill={white} />
        <circle cx="12" cy="10.5" r="1.1" fill={white} />
        <circle cx="16" cy="10.5" r="1.1" fill={white} />
      </>);
    case "archives":
      return iconFrame(className, <>
        <path d="M3 6.2 4.2 4h15.6L21 6.2v2.1H3V6.2Z" fill="currentColor" />
        <path d="M4.2 9.3h15.6l-.8 10.2a2 2 0 0 1-2 1.8H6.9a2 2 0 0 1-2-1.8L4.2 9.3Z" fill="currentColor" />
        <rect x="8.5" y="12" width="7" height="1.5" rx=".75" fill={white} />
      </>);
    case "worldbook":
      return iconFrame(className, <>
        <path d="M4.2 4.1A2.2 2.2 0 0 1 6.4 2H20v17.5H6.4a2.2 2.2 0 0 0-2.2 2V4.1Z" fill="currentColor" />
        <path d="M4.2 19.5A2.2 2.2 0 0 1 6.4 18H20v3.5H6.4a2.2 2.2 0 0 0-2.2 2V19.5Z" fill="currentColor" />
        <rect x="8" y="6" width="7.5" height="1.5" rx=".75" fill={white} />
        <rect x="8" y="9.5" width="5" height="1.5" rx=".75" fill={white} />
      </>);
    case "music":
      return iconFrame(className, <>
        <circle cx="7.2" cy="18" r="3.1" fill="currentColor" />
        <path d="M10 5.1 19 3v10.2a3.7 3.7 0 1 1-2-3.3V6.6l-7 1.7v6.5a3.7 3.7 0 1 1-2-3.3V5.1Z" fill="currentColor" />
        <path d="M17 6.5 19 6v2l-2 .5V6.5Z" fill={white} opacity=".9" />
      </>);
    case "forum":
      return iconFrame(className, <>
        <rect x="3" y="4" width="18" height="16" rx="3" fill="currentColor" />
        <circle cx="8" cy="9" r="1.5" fill={white} />
        <path d="m5 17 4.2-4.5 3.2 3 2.3-2.2L20 17H5Z" fill={white} />
      </>);
    case "store":
      return iconFrame(className, <>
        <path d="M4.2 8.2 5.6 4h12.8l1.4 4.2v2.1a2.6 2.6 0 0 1-4.4 1.9 2.6 2.6 0 0 1-4.8 0 2.6 2.6 0 0 1-4.8 0 2.6 2.6 0 0 1-1.6.6V8.2Z" fill="currentColor" />
        <path d="M5.2 12.4V20h13.6v-7.6c-.8.1-1.6-.1-2.2-.7a2.6 2.6 0 0 1-4.8 0 2.6 2.6 0 0 1-4.8 0c-.5.5-1.1.7-1.8.7Z" fill="currentColor" />
        <rect x="8" y="15" width="8" height="1.4" rx=".7" fill={white} />
      </>);
    case "notes":
      return iconFrame(className, <>
        <rect x="4" y="2.8" width="16" height="18.5" rx="2.3" fill="currentColor" />
        <rect x="7.5" y="6.5" width="9" height="1.4" rx=".7" fill={white} />
        <rect x="7.5" y="10" width="7" height="1.4" rx=".7" fill={white} />
        <rect x="7.5" y="13.5" width="8.5" height="1.4" rx=".7" fill={white} />
      </>);
    case "diary":
      return iconFrame(className, <>
        <path d="M5 3h12.5A2.5 2.5 0 0 1 20 5.5V21H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z" fill="currentColor" />
        <path d="M7.2 9.2c0-1.3 1.6-2 2.5-.9l.3.4.3-.4c.9-1.1 2.5-.4 2.5.9 0 1.4-1.5 2.3-2.8 3.4-1.3-1.1-2.8-2-2.8-3.4Z" fill={white} />
        <rect x="7.2" y="15.3" width="9" height="1.4" rx=".7" fill={white} />
      </>);
    case "memory":
      return iconFrame(className, <>
        <rect x="4" y="3" width="16" height="18" rx="2.5" fill="currentColor" />
        <rect x="7.2" y="7" width="9.6" height="1.5" rx=".75" fill={white} />
        <rect x="7.2" y="10.5" width="6.5" height="1.5" rx=".75" fill={white} />
        <rect x="7.2" y="14" width="8.3" height="1.5" rx=".75" fill={white} />
      </>);
    case "offline":
      return iconFrame(className, <>
        <path d="m12 3 8.5 4.8-8.5 4.8L3.5 7.8 12 3Z" fill="currentColor" />
        <path d="m3.5 11.1 8.5 4.8 8.5-4.8v3.2l-8.5 4.8-8.5-4.8v-3.2Z" fill="currentColor" />
        <path d="m3.5 16.1 8.5 4.8 8.5-4.8v2.2L12 23l-8.5-4.7v-2.2Z" fill="currentColor" />
      </>);
    case "schedule":
      return iconFrame(className, <>
        <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" fill="currentColor" />
        <rect x="3.5" y="7.2" width="17" height="2" fill={white} opacity=".9" />
        <rect x="7" y="2.5" width="2" height="5" rx="1" fill="currentColor" />
        <rect x="15" y="2.5" width="2" height="5" rx="1" fill="currentColor" />
        <circle cx="8" cy="13" r="1" fill={white} /><circle cx="12" cy="13" r="1" fill={white} /><circle cx="16" cy="13" r="1" fill={white} />
        <circle cx="8" cy="17" r="1" fill={white} /><circle cx="12" cy="17" r="1" fill={white} />
      </>);
    case "reading":
      return iconFrame(className, <>
        <path d="M3 4.5c3.2-.6 6.2.1 9 2.1v14c-2.8-2-5.8-2.7-9-2.1v-14Z" fill="currentColor" />
        <path d="M21 4.5c-3.2-.6-6.2.1-9 2.1v14c2.8-2 5.8-2.7 9-2.1v-14Z" fill="currentColor" />
        <path d="M5.5 9c1.7-.1 3.2.3 4.5 1.1v1.5c-1.3-.8-2.8-1.2-4.5-1.1V9Zm13 0v1.5c-1.7-.1-3.2.3-4.5 1.1v-1.5c1.3-.8 2.8-1.2 4.5-1.1Z" fill={white} />
      </>);
    case "cinema":
      return iconFrame(className, <>
        <rect x="3" y="4" width="18" height="16" rx="2.5" fill="currentColor" />
        <path d="M3 8h18v2H3V8Zm0 6h18v2H3v-2Z" fill={white} opacity=".92" />
        <path d="M8 4h2v16H8V4Zm6 0h2v16h-2V4Z" fill={white} opacity=".92" />
      </>);
    case "relationship-network":
      return iconFrame(className, <>
        <path d="m6.4 8.1 10.7-3.3.6 1.8L7 9.9 6.4 8.1Z" fill="currentColor" />
        <path d="m6.5 9.5 10.1 6.9-1.1 1.6-10.1-6.9 1.1-1.6Z" fill="currentColor" />
        <path d="M16.2 6.8h1.9l-.2 9h-1.9l.2-9Z" fill="currentColor" />
        <circle cx="6" cy="9" r="3" fill="currentColor" /><circle cx="18" cy="5" r="3" fill="currentColor" /><circle cx="17" cy="18" r="3" fill="currentColor" />
        <circle cx="6" cy="9" r=".9" fill={white} /><circle cx="18" cy="5" r=".9" fill={white} /><circle cx="17" cy="18" r=".9" fill={white} />
      </>);
    case "settings":
      return iconFrame(className, <>
        <path d="m20.1 13.2 1.1 1.8-2 2-1.8-1.1a7.4 7.4 0 0 1-1.6.7L15.5 19h-3l-.3-2.4a7.4 7.4 0 0 1-1.6-.7l-1.8 1.1-2-2 1.1-1.8a7.4 7.4 0 0 1-.7-1.6L4.8 11.3v-3l2.4-.3a7.4 7.4 0 0 1 .7-1.6L6.8 4.6l2-2 1.8 1.1a7.4 7.4 0 0 1 1.6-.7l.3-2.4h3l.3 2.4a7.4 7.4 0 0 1 1.6.7l1.8-1.1 2 2-1.1 1.8a7.4 7.4 0 0 1 .7 1.6l2.4.3v3l-2.4.3a7.4 7.4 0 0 1-.7 1.6Z" fill="currentColor" transform="translate(-1.2 2.2) scale(.9)" />
        <circle cx="12" cy="10" r="3" fill={white} />
      </>);
    default:
      return iconFrame(className, <circle cx="12" cy="12" r="7" fill="currentColor" />);
  }
}
