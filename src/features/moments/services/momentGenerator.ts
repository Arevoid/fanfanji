import type { Character, MemoryItem, Moment } from "../../../types";
import type { apiChat } from "../../../utils/apiHelper";
import { stripMomentVoiceMarkup } from "./momentContent";

type ChatRequest = Parameters<typeof apiChat>[0];
type RequestAi = (request: ChatRequest) => ReturnType<typeof apiChat>;

export async function requestCharacterMoment(input: {
  requestAi: RequestAi;
  request: ChatRequest;
  character: Character;
  ownerIdentityId: string;
  parseContent: (content: string) => { content: string; selfComments: string[]; imageDescription?: string };
  now?: () => number;
  random?: () => number;
}): Promise<{ moment?: Moment; memory?: MemoryItem }> {
  const response = await input.requestAi(input.request);
  if (!response?.text) return {};
  const now = input.now || Date.now;
  const random = input.random || Math.random;
  const cleanedContent = stripMomentVoiceMarkup(response.text).trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  const parsed = input.parseContent(cleanedContent);
  let image: string | undefined;
  if (!parsed.imageDescription && input.character.album?.length && random() < 0.4) {
    image = input.character.album[Math.floor(random() * input.character.album.length)];
  }
  const timestamp = now();
  const moment: Moment = {
    id: `${timestamp}-char-moment-${random().toString(36).substr(2, 5)}`,
    characterId: input.character.id,
    ownerIdentityId: input.ownerIdentityId,
    authorName: input.character.remark || input.character.name,
    authorAvatar: input.character.avatar,
    content: parsed.content,
    timestamp,
    likes: [],
    comments: parsed.selfComments.map((content, index) => ({
      id: `${timestamp}-self-comment-${index}-${random().toString(36).substr(2, 4)}`,
      authorName: input.character.remark || input.character.name,
      authorAvatar: input.character.avatar,
      content: stripMomentVoiceMarkup(content).trim(),
      timestamp: timestamp + (index + 1) * 1000,
    })),
    image,
    imageType: image ? "photo" : (parsed.imageDescription ? "text" : undefined),
    imageDescription: parsed.imageDescription,
  };
  return {
    moment,
    memory: {
      id: `${timestamp}-moment-memory-${random().toString(36).slice(2, 6)}`,
      characterId: input.character.id,
      content: `【朋友圈动态】${parsed.content}${image ? "（发布时附有配图）" : ""}`,
      timestamp,
      importance: 4,
      isManual: false,
    },
  };
}
