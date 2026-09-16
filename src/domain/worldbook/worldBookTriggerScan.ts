/** The documented World Book trigger window: the current text plus three turns. */
export const WORLD_BOOK_SCAN_MESSAGE_LIMIT = 6;

export function normalizeWorldBookTriggerText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[\s,.;:!?，。！？、；：/\\|()[\]{}<>《》“”‘’「」『』]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildWorldBookScanText(
  currentText: string,
  recentTexts: readonly string[],
  limit = WORLD_BOOK_SCAN_MESSAGE_LIMIT,
): string {
  return [currentText, ...recentTexts.slice(-Math.max(0, limit))]
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n");
}

export function splitWorldBookKeywords(value: string): string[] {
  return value
    .split(/[,，;；\s\t\n\r]+/)
    .map(normalizeWorldBookTriggerText)
    .filter(Boolean);
}

export function worldBookKeywordMatches(scanText: string, keyword: string): boolean {
  const normalizedText = normalizeWorldBookTriggerText(scanText);
  const normalizedKeyword = normalizeWorldBookTriggerText(keyword);
  return Boolean(normalizedKeyword && normalizedText.includes(normalizedKeyword));
}
