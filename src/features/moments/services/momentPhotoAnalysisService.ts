import { aiAnalyzeSticker } from "../../../utils/stickerDb";

export const MOMENT_PHOTO_ANALYSIS_PROMPT = `请客观识别这张朋友圈照片。只返回 JSON，不要代码块：
{"name":"不超过12个中文字符的画面主题","description":"不超过120个中文字符，说明主体、场景、可见文字、动作和关键细节；不要猜测图片外的信息"}`;

/** Best-effort photo analysis for Moments; it never blocks publishing. */
export async function analyzeMomentPhoto(input: {
  image: string;
  apiKey?: string;
  selectedModel?: string;
  apiEndpoint?: string;
  fetchImage?: typeof fetch;
}): Promise<string | undefined> {
  if (!input.image || !input.apiKey) return undefined;
  try {
    const fetchImage = input.fetchImage || fetch;
    const response = await fetchImage(input.image);
    if (!response.ok) throw new Error(`Image fetch failed (${response.status}).`);
    const analysis = await aiAnalyzeSticker(
      await response.blob(),
      input.apiKey,
      input.selectedModel || "gemini-3.5-flash",
      input.apiEndpoint,
      MOMENT_PHOTO_ANALYSIS_PROMPT,
    );
    return analysis.description.trim() || analysis.name.trim() || undefined;
  } catch (error) {
    console.warn("Moment photo analysis failed:", error);
    return undefined;
  }
}
