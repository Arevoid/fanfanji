import type { ReadingStoryEntryMode, ReadingStoryLength } from "../../../domain/reading/storyTypes";

export interface ReadingStoryIdentityDraft {
  entryMode: ReadingStoryEntryMode;
  name: string;
  gender?: string;
  age?: string;
  role?: string;
  persona?: string;
  goal?: string;
  originalCharacterId?: string;
}

export interface ReadingStorySetupDraft {
  mode: "solo" | "together";
  relationId?: string;
  user: ReadingStoryIdentityDraft;
  friend?: ReadingStoryIdentityDraft;
  length: ReadingStoryLength;
}

export function validateReadingStorySetup(draft: ReadingStorySetupDraft): string | null {
  if (draft.mode === "together" && !draft.relationId) return "请选择一起穿书的 AI 好友";
  const validateIdentity = (identity: ReadingStoryIdentityDraft, owner: string): string | null => {
    if (!identity.name.trim()) return `${owner}的角色姓名不能为空`;
    if (identity.entryMode === "soul_wear" && !identity.originalCharacterId?.trim()) return `${owner}需要选择或填写一个原故事角色`;
    return null;
  };
  return validateIdentity(draft.user, "你") || (draft.mode === "together" && draft.friend ? validateIdentity(draft.friend, "好友") : null);
}

export function describeReadingStoryIdentity(identity: ReadingStoryIdentityDraft): string {
  return [identity.entryMode === "soul_wear" ? `魂穿原角色：${identity.name}` : `身穿原创角色：${identity.name}`, identity.gender, identity.age ? `${identity.age}岁` : "", identity.role, identity.persona].filter(Boolean).join(" · ").slice(0, 500);
}
