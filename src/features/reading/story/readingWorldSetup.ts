import type { ReadingStoryLength } from "../../../domain/reading/storyTypes";

export interface ReadingWorldSetupDraft {
  relationId: string;
  title: string;
  genre: string;
  worldView: string;
  userIdentity: string;
  friendIdentity: string;
  synopsis: string;
  intendedEnding?: string;
  length: ReadingStoryLength;
}

export function validateReadingWorldSetup(draft: ReadingWorldSetupDraft): string | null {
  if (!draft.relationId) return "请选择一位 AI 好友";
  if (!draft.title.trim()) return "请填写故事名称";
  if (!draft.genre.trim()) return "请填写故事题材";
  if (!draft.worldView.trim()) return "请填写世界观";
  if (!draft.synopsis.trim()) return "请填写故事梗概";
  return null;
}
