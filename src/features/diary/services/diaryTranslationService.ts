import { apiTranslate } from "../../../utils/apiHelper";
import type { DiaryEntry, DiaryTranslation, UserSettings } from "../../../types";
import { createDiaryContentHash, createDiaryId } from "../../../domain/diary/diaryData";
import { getDiaryTranslation, upsertDiaryTranslation } from "../../../core/storage/repositories/diaryRepository";

export const translateDiaryEntry = async (entry: DiaryEntry, settings: UserSettings, targetLanguage = "zh-CN", translate = apiTranslate): Promise<DiaryTranslation> => {
  const cached = getDiaryTranslation(entry, targetLanguage);
  if (cached) return cached;
  const payload = `[DIARY_TITLE]${entry.title || ""}\n[DIARY_BODY]${entry.body}\n[DIARY_EMOTION]${entry.emotionalState || ""}`;
  const result = await translate({ text: payload, apiKey: settings.apiKey || "", model: settings.selectedModel, apiEndpoint: settings.apiEndpoint, targetLanguage, proxyOnly: true });
  if (!result.text?.trim()) throw new Error("翻译服务未返回内容。");
  const text = result.text.trim();
  const body = text.match(/\[DIARY_BODY\]\s*([\s\S]*?)(?:\n\[DIARY_EMOTION\]|$)/)?.[1]?.trim() || text;
  const title = text.match(/\[DIARY_TITLE\]\s*([^\n]+)/)?.[1]?.trim();
  const emotion = text.match(/\[DIARY_EMOTION\]\s*([^\n]+)/)?.[1]?.trim();
  const translation: DiaryTranslation = { id: createDiaryId("diary-translation"), ownerIdentityId: entry.ownerIdentityId, diaryEntryId: entry.id, sourceContentHash: createDiaryContentHash(entry), targetLanguage, ...(title ? { translatedTitle: title } : {}), translatedBody: body, ...(emotion ? { translatedEmotionalState: emotion } : {}), createdAt: Date.now(), lastAccessedAt: Date.now() };
  if (!upsertDiaryTranslation(translation).success) throw new Error("翻译缓存保存失败。");
  return translation;
};
