import type { Character, MemoryItem, Moment } from "../../../types";
import type { apiChat } from "../../../utils/apiHelper";
import { sanitizeMomentPublishText } from "./momentContent";
import { findMomentTemporalConflicts, type MomentTemporalContext } from "./momentTemporalContext";
import {
  claimCharacterMomentGeneration,
  completeCharacterMomentGeneration,
  releaseCharacterMomentGeneration,
} from "./momentGenerationGuard";

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
  temporalContext?: MomentTemporalContext;
}): Promise<{ moment?: Moment; memory?: MemoryItem }> {
  const response = await input.requestAi(input.request);
  if (!response?.text) return {};
  const now = input.now || Date.now;
  const random = input.random || Math.random;
  const cleanedContent = sanitizeMomentPublishText(response.text).replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  const parsed = input.parseContent(sanitizeMomentPublishText(cleanedContent));
  const temporalConflicts = input.temporalContext
    ? [parsed.content, ...parsed.selfComments]
      .flatMap((content) => findMomentTemporalConflicts(content, input.temporalContext!, input.character))
    : [];
  if (temporalConflicts.length > 0) {
    console.warn("[moments] Rejected temporally inconsistent generated post:", temporalConflicts);
    return {};
  }
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
      content: sanitizeMomentPublishText(content),
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
      content: `【${input.character.name}发布的朋友圈】${parsed.content}${image ? "（发布时附有配图）" : ""}`,
      timestamp,
      importance: 4,
      isManual: false,
    },
  };
}

export async function requestCharacterMomentOnce(input: Parameters<typeof requestCharacterMoment>[0]): Promise<{
  moment?: Moment;
  memory?: MemoryItem;
  skipped?: boolean;
}> {
  const timestamp = (input.now || Date.now)();
  const generatedAt = new Date(timestamp);
  const taskKey = claimCharacterMomentGeneration(input.character.id, generatedAt);
  if (!taskKey) return { skipped: true };

  try {
    const result = await requestCharacterMoment(input);
    if (!result.moment) {
      releaseCharacterMomentGeneration(taskKey);
      return result;
    }

    if (!completeCharacterMomentGeneration(taskKey, result.moment, generatedAt)) {
      console.warn(`[moments] Generated moment task "${taskKey}" could not be persisted; keeping it in memory only.`);
    }
    return result;
  } catch (error) {
    releaseCharacterMomentGeneration(taskKey);
    throw error;
  }
}
