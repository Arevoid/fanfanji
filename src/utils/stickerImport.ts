export interface ParsedStickerImportLine {
  name: string;
  url: string;
}

const STICKER_URL_PATTERN = /https?:\/\/\S+/iu;
const TRAILING_NAME_SEPARATOR_PATTERN = /[|+\s:：]+$/u;

/**
 * Parses one bulk-import line without splitting the URL itself. A sticker name
 * may be joined directly to the URL or separated with |, +, whitespace, : or ：.
 */
export function parseStickerImportLine(line: string): ParsedStickerImportLine | null {
  const trimmedLine = line.trim();
  const urlMatch = STICKER_URL_PATTERN.exec(trimmedLine);
  if (!urlMatch || urlMatch.index === undefined) return null;

  const name = trimmedLine
    .slice(0, urlMatch.index)
    .replace(TRAILING_NAME_SEPARATOR_PATTERN, "")
    .trim();

  return {
    name,
    url: urlMatch[0],
  };
}
