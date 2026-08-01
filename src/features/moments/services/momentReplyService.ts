import type { Character, MomentComment } from "../../../types";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import type { apiChat } from "../../../utils/apiHelper";
import { sanitizeMomentPublishText } from "./momentContent";
import { findMomentTemporalConflicts, type MomentTemporalContext } from "./momentTemporalContext";

type ChatRequest = Parameters<typeof apiChat>[0];
type RequestAi = (request: ChatRequest) => ReturnType<typeof apiChat>;

export async function requestMomentCommentReply(input: {
  requestAi: RequestAi;
  request: ChatRequest;
  character: Character;
  userName: string;
  cleanText: (text: string) => string;
  now?: () => number;
  random?: () => number;
  temporalContext?: MomentTemporalContext;
  /** Phase 3 read-only context; Prompt consumption is intentionally deferred. */
  cognitiveContext?: CharacterCognitiveContext;
}): Promise<MomentComment | undefined> {
  const response = await input.requestAi(input.request);
  if (!response?.text) return undefined;
  const now = input.now || Date.now;
  const random = input.random || Math.random;
  let content = sanitizeMomentPublishText(input.cleanText(response.text.trim())).replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  content = content.replace(/^回复\s*[\(（].*?[\)）]\s*[:：]\s*/, "").replace(/^回复\s*.*?\s*[:：]\s*/, "");
  if (input.temporalContext && findMomentTemporalConflicts(content, input.temporalContext, input.character).length > 0) {
    console.warn("[moments] Rejected temporally inconsistent generated reply.");
    return undefined;
  }
  return { id: `${now()}-reply-${random().toString(36).substr(2, 5)}`, authorName: input.character.remark || input.character.name, authorAvatar: input.character.avatar, content: `回复${input.userName}：${content}`, timestamp: now() };
}
