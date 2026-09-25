/** Wire format for the simulated video-call channel. It stays inside the
 * call transcript and is never persisted as an ordinary chat bubble. */
export const VIDEO_CALL_SPEECH_PREFIX = "[视频说话]|";
export const VIDEO_CALL_SCENE_PREFIX = "[视频画面]|";
export const VIDEO_CALL_SCENE_RESPONSE_PREFIX = "[画面]|";
export const VIDEO_CALL_SPEECH_RESPONSE_PREFIX = "[台词]|";

export type VideoCallInputMode = "speech" | "scene";

export interface ParsedVideoCallResponse {
  speech: string;
  scene?: string;
}

export interface VideoCallSceneEntry {
  id: string;
  content: string;
  timestamp: number;
}

export const createVideoCallInputMarkup = (text: string, mode: VideoCallInputMode): string =>
  `${mode === "scene" ? VIDEO_CALL_SCENE_PREFIX : VIDEO_CALL_SPEECH_PREFIX}${text.trim()}`;

export const parseVideoCallInputMarkup = (content: string): { mode: VideoCallInputMode; text: string } => {
  const normalized = content.trim();
  if (normalized.startsWith(VIDEO_CALL_SCENE_PREFIX)) {
    return { mode: "scene", text: normalized.slice(VIDEO_CALL_SCENE_PREFIX.length).trim() };
  }
  if (normalized.startsWith(VIDEO_CALL_SPEECH_PREFIX)) {
    return { mode: "speech", text: normalized.slice(VIDEO_CALL_SPEECH_PREFIX.length).trim() };
  }
  return { mode: "speech", text: normalized };
};

const stripDecorativeQuote = (value: string): string => value
  .trim()
  .replace(/^[“「『"']+|[”」』"']+$/gu, "")
  .trim();

export function parseVideoCallResponse(content: string): ParsedVideoCallResponse {
  const sceneLines: string[] = [];
  const speechLines: string[] = [];
  const markerPattern = /(?:\[|【)(画面|视频画面|台词|对话|视频说话)(?:\]|】)(?:\||[:：])?\s*/gu;
  const lines = content.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  lines.forEach((line) => {
    const markers = [...line.matchAll(markerPattern)];
    if (markers.length === 0) {
      speechLines.push(stripDecorativeQuote(line));
      return;
    }

    const prefix = line.slice(0, markers[0].index ?? 0).trim();
    if (prefix) {
      // Models sometimes omit the opening [画面] marker but still emit a
      // [台词] marker. In a video turn, the prose before that marker is the
      // scene description rather than spoken dialogue.
      if (markers[0][1] === "台词" || markers[0][1] === "对话" || markers[0][1] === "视频说话") sceneLines.push(prefix);
      else speechLines.push(stripDecorativeQuote(prefix));
    }

    markers.forEach((marker, index) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = index + 1 < markers.length ? (markers[index + 1].index ?? line.length) : line.length;
      const value = line.slice(start, end).trim();
      if (!value) return;
      if (marker[1] === "画面" || marker[1] === "视频画面") sceneLines.push(value);
      else speechLines.push(stripDecorativeQuote(value));
    });
  });

  return {
    speech: speechLines.join("\n").trim(),
    ...(sceneLines.length > 0 ? { scene: sceneLines.join("\n").trim() } : {}),
  };
}

export const getVideoCallDisplayText = (content: string): string => {
  const input = parseVideoCallInputMarkup(content);
  return input.mode === "scene" ? `画面：${input.text}` : input.text;
};
