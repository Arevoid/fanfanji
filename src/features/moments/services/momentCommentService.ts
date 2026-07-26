import type { Character, MomentComment } from "../../../types";
import type { apiChat } from "../../../utils/apiHelper";
import { stripMomentVoiceMarkup } from "./momentContent";
import { findMomentTemporalConflicts, type MomentTemporalContext } from "./momentTemporalContext";

type ChatRequest = Parameters<typeof apiChat>[0];
type RequestAi = (request: ChatRequest) => ReturnType<typeof apiChat>;

export async function requestAutomaticMomentComment(input: {
  requestAi: RequestAi;
  request: ChatRequest;
  character: Character;
  cleanText: (text: string) => string;
  now?: () => number;
  random?: () => number;
  temporalContext?: MomentTemporalContext;
}): Promise<MomentComment | undefined> {
  const response = await input.requestAi(input.request);
  if (!response?.text) return undefined;
  const now = input.now || Date.now;
  const random = input.random || Math.random;
  const content = stripMomentVoiceMarkup(input.cleanText(response.text.trim())).replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  if (input.temporalContext && findMomentTemporalConflicts(content, input.temporalContext, input.character).length > 0) {
    console.warn("[moments] Rejected temporally inconsistent generated comment.");
    return undefined;
  }
  return { id: `${now()}-comment-${random().toString(36).substr(2, 5)}`, authorName: input.character.remark || input.character.name, authorAvatar: input.character.avatar, content, timestamp: now() };
}
