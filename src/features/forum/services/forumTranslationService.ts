import { apiTranslate } from "../../../utils/apiHelper";
import type { ForumTranslation, UserSettings } from "../../../types";
import { createId as createApplicationId } from "../../../core/id/createId";
import {
  createForumTranslationHash,
  getForumTranslation,
  touchForumTranslation,
  upsertForumTranslation,
} from "../../../core/storage/repositories/forumTranslationRepository";

const inFlightTranslations = new Map<string, Promise<ForumTranslation>>();

const createId = (): string => createApplicationId("forum-translation");

export const getForumTranslationTargetLanguage = (_settings: UserSettings): string => "zh-CN";

export const translateForumContent = async (input: {
  ownerIdentityId: string;
  contentType: "thread" | "reply";
  contentId: string;
  title?: string;
  body: string;
  targetLanguage: string;
  settings: UserSettings;
  now?: number;
  translate?: typeof apiTranslate;
}): Promise<ForumTranslation> => {
  const sourceContent = input.contentType === "thread"
    ? `${input.title || ""}\n${input.body}`
    : input.body;
  const sourceContentHash = createForumTranslationHash(sourceContent);
  const lookup = {
    ownerIdentityId: input.ownerIdentityId,
    contentType: input.contentType,
    contentId: input.contentId,
    sourceContentHash,
    targetLanguage: input.targetLanguage,
  } as const;
  const cached = getForumTranslation(lookup);
  if (cached) {
    touchForumTranslation(cached, input.now ?? Date.now());
    return { ...cached, lastAccessedAt: input.now ?? Date.now() };
  }
  const key = [lookup.ownerIdentityId, lookup.contentType, lookup.contentId, lookup.sourceContentHash, lookup.targetLanguage].join("|");
  const active = inFlightTranslations.get(key);
  if (active) return active;
  const request = (async () => {
    if (!input.body.trim()) throw new Error("没有可翻译的公开文本。");
    const now = input.now ?? Date.now();
    const payload = input.contentType === "thread"
      ? `[FORUM_TITLE]${input.title || ""}\n[FORUM_BODY]${input.body}`
      : input.body;
    const response = await (input.translate || apiTranslate)({
      text: payload,
      apiKey: input.settings.apiKey || "",
      model: input.settings.selectedModel,
      apiEndpoint: input.settings.apiEndpoint,
      targetLanguage: input.targetLanguage,
      proxyOnly: true,
    });
    const translated = response.text.trim();
    if (!translated) throw new Error("翻译服务未返回内容。");
    let translatedTitle: string | undefined;
    let translatedBody = translated;
    if (input.contentType === "thread") {
      const titleMatch = translated.match(/\[FORUM_TITLE\]\s*([^\n]+)[\r\n]+\[FORUM_BODY\]\s*([\s\S]+)/);
      if (titleMatch) {
        translatedTitle = titleMatch[1].trim();
        translatedBody = titleMatch[2].trim();
      }
    }
    const entry: ForumTranslation = {
      id: createId(),
      ...lookup,
      ...(translatedTitle ? { translatedTitle } : {}),
      translatedBody,
      createdAt: now,
      lastAccessedAt: now,
    };
    if (!upsertForumTranslation(entry).success) throw new Error("翻译缓存保存失败。");
    return entry;
  })();
  inFlightTranslations.set(key, request);
  try {
    return await request;
  } finally {
    inFlightTranslations.delete(key);
  }
};
