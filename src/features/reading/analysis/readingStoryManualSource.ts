import { createId } from "../../../core/id/createId";
import { loadReadingStore } from "../../../core/storage/repositories/readingRepository";
import { loadReadingAnalysisStore, saveReadingAnalysisStore } from "../../../core/storage/repositories/readingAnalysisRepository";
import type { ReadingAnalysisEntity, ReadingBookBible } from "../../../domain/reading/analysisTypes";
import type { ReadingBook } from "../../../domain/reading/types";

export interface ReadingStoryManualDraft {
  premise: string;
  worldRules: string;
  storyLines: string;
  timeline: string;
  /** One person per line: name | description. Empty descriptions remain unknown. */
  characters: string;
}
const lines = (value: string) => value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).slice(0, 100);

/** A single scoped write; no provider request and no fabricated missing facts. */
export function saveReadingStoryManualSource(book: ReadingBook, draft: ReadingStoryManualDraft) {
  if (!loadReadingStore().value.books.some(item => item.id === book.id && item.userIdentityId === book.userIdentityId)) throw new Error("当前身份下找不到这本书");
  const store = loadReadingAnalysisStore().value;
  const inScope = (item: { bookId: string; userIdentityId: string }) => item.bookId === book.id && item.userIdentityId === book.userIdentityId;
  const now = Date.now();
  const previous = store.bookBibles.find(inScope);
  const existing = store.entities.filter(item => inScope(item) && item.kind === "character");
  const names = new Set<string>();
  const characters: ReadingAnalysisEntity[] = lines(draft.characters).flatMap(line => {
    const [rawName, ...description] = line.split(/[|｜]/u);
    const name = rawName.trim().slice(0, 300);
    if (!name || names.has(name)) return [];
    names.add(name);
    const old = existing.find(item => item.name === name);
    return [{ ...old, id: old?.id || createId("reading-manual-person"), userIdentityId: book.userIdentityId, bookId: book.id,
      kind: "character", name, summary: description.join("｜").trim().slice(0, 4000), aliases: old?.aliases || [],
      attributes: old?.attributes || {}, chapterIds: old?.chapterIds || [], confidence: old?.confidence || 0,
      source: "user", analysisVersion: "story-manual-v1", createdAt: old?.createdAt || now, updatedAt: now }];
  });
  const bible: ReadingBookBible = { id: previous?.id || createId("reading-manual-bible"), userIdentityId: book.userIdentityId, bookId: book.id,
    version: (previous?.version || 0) + 1, analysisVersion: "story-manual-v1", source: "user", isUserEdited: true,
    premise: draft.premise.trim().slice(0, 4000), worldRules: lines(draft.worldRules), storyLines: lines(draft.storyLines), timeline: lines(draft.timeline),
    coreCharacterIds: characters.map(item => item.id), keyLocationIds: previous?.keyLocationIds || [], keyFactionIds: previous?.keyFactionIds || [],
    createdAt: previous?.createdAt || now, updatedAt: now };
  const result = saveReadingAnalysisStore({ ...store, entities: [...store.entities.filter(item => !(inScope(item) && item.kind === "character")), ...characters], bookBibles: [...store.bookBibles.filter(item => !inScope(item)), bible] });
  if (!result.success) throw new Error("资料保存失败，请检查本地存储后再试。");
  return { coreCharacters: characters, bookBible: bible };
}

/** Source labels travel with the facts; absent information is never presented as canon. */
export function describeReadingStorySource(bible?: ReadingBookBible, characters: ReadingAnalysisEntity[] = []): string {
  const origin = bible?.source === "user" || bible?.isUserEdited ? "用户填写，未经原著核验" : "有限摘录分析，并非全书事实";
  return [
    `资料来源：${origin}。缺失信息保持未知，不得声称已从原著确认。`,
    `梗概：${bible?.premise || "未确定"}`,
    `背景与规则：${bible?.worldRules.join("；") || "未确定"}`,
    `故事线：${bible?.storyLines.join("；") || "未确定"}`,
    `时间线：${bible?.timeline.join("；") || "未确定"}`,
    ...characters.map(person => `人物（${person.source === "user" ? "用户填写" : "摘录分析"}）：${person.name}｜${person.summary || "介绍未确定"}`),
  ].join("\n");
}
