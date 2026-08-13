import { readingAssetDb } from "../../../core/storage/readingAssetDb";
import { loadReadingStore } from "../../../core/storage/repositories/readingRepository";
import { apiChat } from "../../../utils/apiHelper";
import type {
  ReadingAnalysisEntity,
  ReadingBookBible,
} from "../../../domain/reading/analysisTypes";
import type { ReadingBook } from "../../../domain/reading/types";
import {
  commitReadingChapterAnalysisResult,
  createReadingAnalysisTask,
  getReadingBookBible,
  listReadingAnalysisEntities,
  markReadingAnalysisFailed,
  startReadingAnalysisTask,
} from "./readingAnalysis";
import { validateReadingChapterAnalysisResponse } from "./readingAnalysisProtocol";

export interface ReadingStoryPreparationSettings {
  apiKey: string;
  selectedModel: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}

export interface ReadingStoryPreparationResult {
  coreCharacters: ReadingAnalysisEntity[];
  bookBible?: ReadingBookBible;
}

const parseJson = (raw: string): unknown => {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start)
      return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("小说识别结果不是有效 JSON");
  }
};

async function loadRepresentativeExcerpt(
  book: ReadingBook,
): Promise<{ chapterId: string; text: string }> {
  const store = loadReadingStore().value;
  const chapters = store.chapters
    .filter(
      (chapter) =>
        chapter.userIdentityId === book.userIdentityId &&
        chapter.bookId === book.id,
    )
    .sort((left, right) => left.order - right.order);
  if (!chapters.length) throw new Error("小说还没有可用于识别的章节");
  const asset = await readingAssetDb.load(
    book.assetId,
    book.userIdentityId,
    book.id,
  );
  if (!asset) throw new Error("找不到小说正文，请重新导入这本书");
  const fullText = await asset.blob.text();
  const indexes = Array.from(
    new Set([
      0,
      Math.floor((chapters.length - 1) * 0.25),
      Math.floor((chapters.length - 1) * 0.5),
      Math.floor((chapters.length - 1) * 0.75),
      chapters.length - 1,
    ]),
  );
  const excerpts = indexes.map((index) => {
    const chapter = chapters[index];
    const anchors = store.paragraphAnchors
      .filter(
        (anchor) =>
          anchor.userIdentityId === book.userIdentityId &&
          anchor.bookId === book.id &&
          anchor.chapterId === chapter.id,
      )
      .sort((left, right) => left.ordinal - right.ordinal);
    const start = anchors[0]?.characterStart ?? 0;
    const end =
      anchors.at(-1)?.characterEnd ?? Math.min(fullText.length, start + 2800);
    return `【${chapter.title}】\n${fullText.slice(start, Math.min(end, start + 2800))}`;
  });
  return {
    chapterId: chapters[0].id,
    text: excerpts.join("\n\n").slice(0, 15000),
  };
}

export async function prepareReadingStorySource(input: {
  book: ReadingBook;
  settings: ReadingStoryPreparationSettings;
  onProgress?: (progress: number) => void;
}): Promise<ReadingStoryPreparationResult> {
  const scope = {
    userIdentityId: input.book.userIdentityId,
    bookId: input.book.id,
  };
  const existingCharacters = listReadingAnalysisEntities(scope, "character");
  const existingBible = getReadingBookBible(scope);
  if (
    existingCharacters.length > 0 &&
    existingBible?.premise &&
    existingBible.worldRules.length &&
    existingBible.storyLines.length
  ) {
    input.onProgress?.(100);
    return { coreCharacters: existingCharacters, bookBible: existingBible };
  }
  if (!input.settings.apiKey.trim() || !input.settings.selectedModel.trim())
    throw new Error(
      "请先在设置中配置 API Key 和模型，才能识别世界观、故事线与核心人物",
    );

  input.onProgress?.(12);
  const excerpt = await loadRepresentativeExcerpt(input.book);
  input.onProgress?.(30);
  const task = createReadingAnalysisTask({
    scope,
    type: "book_bible",
    inputVersion: input.book.contentHash,
    chapterIds: [excerpt.chapterId],
  });
  startReadingAnalysisTask(scope, task.id);
  const schema = `{"summary":"摘录摘要","keyPoints":["要点"],"entities":[{"kind":"character|location|faction|event","name":"名称","aliases":[],"summary":"说明","attributes":{},"confidence":0.9}],"premise":"完整故事梗概与主线","worldRules":["世界观或规则"],"storyLines":["主要故事线"],"timeline":["关键事件顺序"]}`;
  try {
    let lastError = "识别结果不完整";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      input.onProgress?.(45 + attempt * 20);
      const response = await apiChat({
        message: `书名：《${input.book.title}》\n以下是从开端、中段与结尾抽取的有限文本样本，不要逐字续写：\n\n${excerpt.text}\n\n请识别世界观、核心故事线、关键时间线，以及明确出现的核心人物、地点、势力和事件。只输出 JSON，结构严格使用：${schema}`,
        history: [],
        systemInstruction:
          "你负责为互动穿书玩法建立小说资料。仅根据提供的有限摘录归纳；不确定的信息要降低 confidence，不要杜撰。必须返回世界观、故事线和至少一位核心人物。只输出 JSON。",
        apiKey: input.settings.apiKey,
        model: input.settings.selectedModel,
        apiEndpoint: input.settings.apiEndpoint,
        apiTemperature: input.settings.apiTemperature,
        streamCompatible: input.settings.streamCompatible,
      });
      const validated = validateReadingChapterAnalysisResponse(
        parseJson(response.text),
      );
      if ("error" in validated) {
        lastError = validated.error;
        continue;
      }
      const hasCharacter = validated.value.entities.some(
        (entity) => entity.kind === "character",
      );
      if (
        !hasCharacter ||
        !validated.value.premise ||
        !validated.value.worldRules?.length ||
        !validated.value.storyLines?.length
      ) {
        lastError = "模型没有完整返回世界观、故事线和核心人物";
        continue;
      }
      input.onProgress?.(88);
      commitReadingChapterAnalysisResult({
        scope,
        taskId: task.id,
        chapterId: excerpt.chapterId,
        sourceHash: input.book.contentHash,
        analysisVersion: "story-setup-v1",
        result: validated.value,
      });
      input.onProgress?.(100);
      return {
        coreCharacters: listReadingAnalysisEntities(scope, "character"),
        bookBible: getReadingBookBible(scope),
      };
    }
    throw new Error(lastError);
  } catch (error) {
    markReadingAnalysisFailed({
      scope,
      taskId: task.id,
      error: error instanceof Error ? error.message : "小说识别失败",
    });
    throw error;
  }
}
