import type { CinemaCue } from "../../domain/cinema/types";

function parseTimestamp(value: string): number | null {
  const match = value.trim().replace(",", ".").match(/^(\d+):([0-5]?\d):([0-5]?\d)(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const milliseconds = Number((match[4] || "").padEnd(3, "0") || 0);
  return Number(match[1]) * 3_600_000 + Number(match[2]) * 60_000 + Number(match[3]) * 1_000 + milliseconds;
}

export function parseSubtitleText(source: string, format: "srt" | "vtt"): CinemaCue[] {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  const blocks = normalized.split(/\n{2,}/);
  const cues: CinemaCue[] = [];
  blocks.forEach((block, index) => {
    const lines = block.split("\n").map((line) => line.trimEnd());
    const timingIndex = lines.findIndex((line) => line.includes(" --> "));
    if (timingIndex < 0) return;
    const [startRaw, endRaw] = lines[timingIndex].split(" --> ");
    const startMs = parseTimestamp(startRaw.trim().split(" ")[0]);
    const endMs = parseTimestamp(endRaw.trim().split(" ")[0]);
    if (startMs === null || endMs === null || endMs <= startMs) return;
    const text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (!text) return;
    cues.push({ id: `${format}-${index}-${startMs}`, startMs, endMs, text });
  });
  return cues.sort((left, right) => left.startMs - right.startMs);
}

export function getSubtitleContext(cues: readonly CinemaCue[], positionMs: number, radius = 2): string {
  if (!cues.length) return "";
  const currentIndex = cues.findIndex((cue) => positionMs >= cue.startMs && positionMs <= cue.endMs);
  const nearestIndex = currentIndex >= 0
    ? currentIndex
    : cues.reduce((best, cue, index) => Math.abs(cue.startMs - positionMs) < Math.abs(cues[best].startMs - positionMs) ? index : best, 0);
  return cues.slice(Math.max(0, nearestIndex - radius), nearestIndex + radius + 1)
    .map((cue) => `[${formatSubtitleTime(cue.startMs)}] ${cue.text}`)
    .join("\n");
}

export function formatSubtitleTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remaining = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
