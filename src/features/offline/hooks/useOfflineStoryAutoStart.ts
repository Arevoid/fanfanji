import { useEffect, type MutableRefObject } from "react";
import type { OfflineStory } from "../../../types";

interface UseOfflineStoryAutoStartOptions {
  activeStory: OfflineStory | null;
  activeStoryRef: MutableRefObject<OfflineStory | null>;
  isGenerating: boolean;
  saveActiveStorySnapshot: (story: OfflineStory) => void;
  handleSendMessage: (textToSend?: string, forceAIOnly?: boolean) => Promise<void>;
}

/** Starts only the explicitly marked first act, then persists that marker as consumed. */
export function useOfflineStoryAutoStart({
  activeStory,
  activeStoryRef,
  isGenerating,
  saveActiveStorySnapshot,
  handleSendMessage,
}: UseOfflineStoryAutoStartOptions) {
  useEffect(() => {
    const story = activeStoryRef.current ?? activeStory;
    if (!story?.autoStartFirstAct || story.messages.some((message) => !message.isImportedContext) || isGenerating) return;
    const preparedStory = { ...story, autoStartFirstAct: false, updatedAt: Date.now() };
    saveActiveStorySnapshot(preparedStory);
    void handleSendMessage(undefined, true);
  }, [activeStory?.id, activeStory?.autoStartFirstAct]);
}
