import type {
  ReadingNarrativePerspective,
  ReadingStoryGenerationPreferences,
} from "./storyTypes";

export const DEFAULT_READING_STORY_GENERATION_PREFERENCES: ReadingStoryGenerationPreferences = {
  minCharacters: 600,
  maxCharacters: 1200,
  narrativeStyle: "沉浸细腻",
  perspective: "second_person",
  guidance: undefined,
};

const perspectives: ReadingNarrativePerspective[] = ["first_person", "second_person", "third_person"];

export function normalizeReadingStoryGenerationPreferences(
  value?: Partial<ReadingStoryGenerationPreferences> | Record<string, unknown>,
): ReadingStoryGenerationPreferences {
  const requestedMin = Math.round(Number(value?.minCharacters) || DEFAULT_READING_STORY_GENERATION_PREFERENCES.minCharacters);
  const requestedMax = Math.round(Number(value?.maxCharacters) || DEFAULT_READING_STORY_GENERATION_PREFERENCES.maxCharacters);
  const minCharacters = Math.min(5000, Math.max(200, requestedMin));
  const maxCharacters = Math.min(5000, Math.max(minCharacters, requestedMax));
  const perspective = perspectives.includes(value?.perspective as ReadingNarrativePerspective)
    ? value!.perspective as ReadingNarrativePerspective
    : DEFAULT_READING_STORY_GENERATION_PREFERENCES.perspective;
  return {
    minCharacters,
    maxCharacters,
    narrativeStyle: String(value?.narrativeStyle || DEFAULT_READING_STORY_GENERATION_PREFERENCES.narrativeStyle).trim().slice(0, 100) || DEFAULT_READING_STORY_GENERATION_PREFERENCES.narrativeStyle,
    perspective,
    guidance: String(value?.guidance || "").trim().slice(0, 4000) || undefined,
  };
}

export const describeReadingNarrativePerspective = (value: ReadingNarrativePerspective): string => ({
  first_person: "第一人称（我）",
  second_person: "第二人称（你）",
  third_person: "第三人称（角色名/TA）",
})[value];
