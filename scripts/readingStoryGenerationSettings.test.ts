import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ReadingStoryState } from "../src/domain/reading/storyTypes";
import {
  DEFAULT_READING_STORY_GENERATION_PREFERENCES,
  normalizeReadingStoryGenerationPreferences,
} from "../src/domain/reading/storyGenerationPreferences";
import { buildReadingStoryPrompt } from "../src/features/reading/story/readingStoryPrompt";

assert.deepEqual(normalizeReadingStoryGenerationPreferences(), DEFAULT_READING_STORY_GENERATION_PREFERENCES);
assert.deepEqual(
  normalizeReadingStoryGenerationPreferences({ minCharacters: 80, maxCharacters: 30, narrativeStyle: "  悬疑紧张  ", perspective: "first_person", guidance: "  不要提前揭晓真相  " }),
  { minCharacters: 200, maxCharacters: 200, narrativeStyle: "悬疑紧张", perspective: "first_person", guidance: "不要提前揭晓真相" },
);

const story: ReadingStoryState = {
  userIdentityId: "user-a", storyId: "story-a", title: "测试故事", entryMode: "body_wear", status: "active", length: "short",
  targetChapters: 3, currentChapter: 1, currentLocation: "旧宅", currentTime: "深夜", characterName: "林舟", goals: [], discoveredIntel: [], tasks: [], relationships: {}, inventory: [],
  generationPreferences: { minCharacters: 900, maxCharacters: 1500, narrativeStyle: "影视镜头", perspective: "third_person", guidance: "让暴雨推动下一场冲突" },
  createdAt: 1, updatedAt: 1,
};
const prompt = buildReadingStoryPrompt({ story, recentTurns: [], userAction: "推开门" });
assert.match(prompt.systemInstruction, /900 至 1500 个中文字符/);
assert.match(prompt.message, /影视镜头/);
assert.match(prompt.message, /第三人称/);
assert.match(prompt.message, /让暴雨推动下一场冲突/);
assert.match(prompt.systemInstruction, /正好 4 个可执行方向/);

const dialog = readFileSync(new URL("../src/components/reading/ReadingStoryGenerationSettingsDialog.tsx", import.meta.url), "utf8");
const solo = readFileSync(new URL("../src/components/reading/ReadingStoryView.tsx", import.meta.url), "utf8");
const shared = readFileSync(new URL("../src/components/reading/ReadingCoStoryView.tsx", import.meta.url), "utf8");
const coPrompt = readFileSync(new URL("../src/features/reading/story/readingCoStoryPrompt.ts", import.meta.url), "utf8");
assert.match(coPrompt, /彼此不同、互斥/);
assert.match(dialog, /每次剧情生成字数/);
assert.match(dialog, /叙事风格/);
assert.match(dialog, /叙事视角/);
assert.match(dialog, /补充内容 · 场外指导/);
for (const source of [solo, shared]) {
  assert.match(source, /aria-label="剧情生成设置"/);
  assert.match(source, /ReadingStoryGenerationSettingsDialog/);
}

console.log("reading story generation settings tests passed");
