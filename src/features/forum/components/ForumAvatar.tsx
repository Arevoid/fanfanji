import { UserRound } from "lucide-react";
import type { ForumPublicAuthor } from "../../../types";

const virtualAvatarStyle = (displayName: string) => {
  let hash = 0;
  for (let index = 0; index < displayName.length; index += 1) {
    hash = Math.imul(hash, 31) + displayName.charCodeAt(index);
  }
  const palettes = [
    ["#eef2ff", "#4f46e5"],
    ["#ecfeff", "#0e7490"],
    ["#f0fdf4", "#15803d"],
    ["#fff7ed", "#c2410c"],
    ["#fdf2f8", "#be185d"],
    ["#f5f3ff", "#7e22ce"],
  ] as const;
  const [backgroundColor, color] = palettes[Math.abs(hash) % palettes.length];
  return { backgroundColor, color };
};

export function ForumAvatar({
  author,
  className = "h-10 w-10",
}: {
  author: ForumPublicAuthor;
  className?: string;
}) {
  if (author.avatar && !author.isAnonymous) {
    return (
      <img
        src={author.avatar}
        alt=""
        className={`${className} shrink-0 rounded-full bg-slate-100 object-cover`}
      />
    );
  }

  if (author.kind === "virtual" && !author.isAnonymous) {
    return (
      <span
        className={`${className} flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold`}
        style={virtualAvatarStyle(author.displayName)}
        aria-hidden="true"
      >
        {author.displayName.slice(0, 1)}
      </span>
    );
  }

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500`}
      aria-hidden="true"
    >
      <UserRound className="h-1/2 w-1/2" strokeWidth={1.8} />
    </span>
  );
}
