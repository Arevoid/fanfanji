import React from "react";
import type { ReadingBook } from "../../domain/reading/types";

const palettes = [
  "from-emerald-950 via-teal-800 to-cyan-600",
  "from-slate-950 via-indigo-900 to-violet-600",
  "from-stone-950 via-amber-900 to-orange-500",
  "from-rose-950 via-red-900 to-amber-600",
  "from-sky-950 via-blue-800 to-teal-500",
];

export default function ReadingBookCover({ book, className = "" }: { book: ReadingBook; className?: string }) {
  if (book.coverUrl) return <img src={book.coverUrl} alt={`${book.title}封面`} className={`object-cover ${className}`} />;
  const palette = palettes[Array.from(book.title).reduce((sum, character) => sum + (character.codePointAt(0) || 0), 0) % palettes.length];
  return (
    <div aria-label={`${book.title}默认封面`} className={`relative overflow-hidden bg-gradient-to-br ${palette} ${className}`}>
      <div className="absolute -right-7 top-4 h-20 w-20 rounded-full border border-white/15" />
      <div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-white/10 blur-xl" />
      <div className="relative flex h-full flex-col justify-between p-2.5 text-white">
        <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/60">FANFAN READER</span>
        <div><p className="line-clamp-3 text-sm font-black leading-5 drop-shadow">{book.title}</p>{book.author && <p className="mt-1 truncate text-[9px] text-white/65">{book.author}</p>}</div>
      </div>
    </div>
  );
}
