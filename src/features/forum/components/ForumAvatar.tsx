import { UserRound } from "lucide-react";
import type { ForumPublicAuthor } from "../../../types";

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

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500`}
      aria-hidden="true"
    >
      <UserRound className="h-1/2 w-1/2" strokeWidth={1.8} />
    </span>
  );
}
