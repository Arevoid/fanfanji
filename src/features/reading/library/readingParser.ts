import type { ParagraphAnchor, ReadingChapter } from "../../../domain/reading/types";

export interface ParsedReadingDocument {
  chapters: ReadingChapter[];
  paragraphAnchors: ParagraphAnchor[];
}

interface ParagraphDraft {
  text: string;
  characterStart: number;
  characterEnd: number;
}

interface ChapterDraft {
  title: string;
  paragraphs: ParagraphDraft[];
}

const markdownHeading = /^#{1,6}\s+(.+)$/u;
const novelHeading = /^(?:第[〇零一二三四五六七八九十百千万两\d]+[章节卷回部篇集幕](?:\s+.{0,48})?|序章|楔子|引子|前言|后记|尾声|番外(?:\s+.{0,32})?|(?:chapter|part)\s+[\divxlcdm]+(?:\s+.{0,48})?)$/iu;

const countCharacters = (text: string): number => [...text].filter((character) => !/\s/u.test(character)).length;
const normalizeParagraph = (text: string): string => text.trim().replace(/\s+/gu, " ");

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("当前环境无法建立稳定段落锚点");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function headingTitle(line: string, format: "txt" | "markdown"): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (format === "markdown") {
    const match = trimmed.match(markdownHeading);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return novelHeading.test(trimmed) ? trimmed : null;
}

function buildDrafts(text: string, format: "txt" | "markdown"): ChapterDraft[] {
  const chapters: ChapterDraft[] = [];
  let current: ChapterDraft | null = null;
  const linePattern = /[^\n]+/gu;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(text))) {
    const rawLine = match[0];
    const leadingWhitespace = rawLine.length - rawLine.trimStart().length;
    const paragraphText = rawLine.trim();
    if (!paragraphText) continue;
    const title = headingTitle(paragraphText, format);
    if (title) {
      if (current && current.paragraphs.length === 0) {
        current.title = title;
        continue;
      }
      current = { title, paragraphs: [] };
      chapters.push(current);
      continue;
    }
    if (!current) {
      current = { title: chapters.length === 0 ? "正文" : `第 ${chapters.length + 1} 章`, paragraphs: [] };
      chapters.push(current);
    }
    const characterStart = match.index + leadingWhitespace;
    current.paragraphs.push({
      text: paragraphText,
      characterStart,
      characterEnd: characterStart + paragraphText.length,
    });
  }

  return chapters.length > 0 ? chapters : [{ title: "正文", paragraphs: [] }];
}

export async function parseReadingDocument(input: {
  text: string;
  format: "txt" | "markdown";
  userIdentityId: string;
  bookId: string;
}): Promise<ParsedReadingDocument> {
  const drafts = buildDrafts(input.text, input.format);
  const chapters: ReadingChapter[] = [];
  const paragraphAnchors: ParagraphAnchor[] = [];

  for (let chapterOrder = 0; chapterOrder < drafts.length; chapterOrder += 1) {
    const draft = drafts[chapterOrder];
    const chapterHash = await sha256Hex(`${input.bookId}:${chapterOrder}:${draft.title}`);
    const chapterId = `chapter-${chapterOrder}-${chapterHash.slice(0, 12)}`;
    const chapterAnchors: ParagraphAnchor[] = [];

    for (let ordinal = 0; ordinal < draft.paragraphs.length; ordinal += 1) {
      const paragraph = draft.paragraphs[ordinal];
      const normalizedTextHash = await sha256Hex(normalizeParagraph(paragraph.text));
      const anchorHash = await sha256Hex(`${input.bookId}:${chapterId}:${ordinal}:${normalizedTextHash}`);
      chapterAnchors.push({
        id: `anchor-${chapterOrder}-${ordinal}-${anchorHash.slice(0, 12)}`,
        userIdentityId: input.userIdentityId,
        bookId: input.bookId,
        chapterId,
        ordinal,
        normalizedTextHash,
        characterStart: paragraph.characterStart,
        characterEnd: paragraph.characterEnd,
      });
    }

    paragraphAnchors.push(...chapterAnchors);
    chapters.push({
      id: chapterId,
      userIdentityId: input.userIdentityId,
      bookId: input.bookId,
      order: chapterOrder,
      title: draft.title,
      firstParagraphAnchorId: chapterAnchors[0]?.id,
      lastParagraphAnchorId: chapterAnchors.at(-1)?.id,
      wordCount: draft.paragraphs.reduce((total, paragraph) => total + countCharacters(paragraph.text), 0),
    });
  }

  return { chapters, paragraphAnchors };
}
