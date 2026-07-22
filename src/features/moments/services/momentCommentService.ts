import type { Character, MomentComment } from "../../../types";
import type { apiChat } from "../../../utils/apiHelper";

type ChatRequest = Parameters<typeof apiChat>[0];
type RequestAi = (request: ChatRequest) => ReturnType<typeof apiChat>;

export async function requestAutomaticMomentComment(input: {
  requestAi: RequestAi;
  request: ChatRequest;
  character: Character;
  cleanText: (text: string) => string;
  now?: () => number;
  random?: () => number;
}): Promise<MomentComment | undefined> {
  const response = await input.requestAi(input.request);
  if (!response?.text) return undefined;
  const now = input.now || Date.now;
  const random = input.random || Math.random;
  const content = input.cleanText(response.text.trim()).replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  return { id: `${now()}-comment-${random().toString(36).substr(2, 5)}`, authorName: input.character.remark || input.character.name, authorAvatar: input.character.avatar, content, timestamp: now() };
}
