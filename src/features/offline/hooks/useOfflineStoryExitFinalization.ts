import type { MutableRefObject } from "react";
import type { Appointment } from "../../../domain/schedule/scheduleTypes";
import type { OfflineStory } from "../../../types";
import { completeAppointmentOfflineSession } from "../../../domain/schedule/appointmentOfflineHandoff";
import { createPendingOfflineHandoff, getOfflineHandoffSourceMessagesForReturn } from "../../../domain/memory/offlineMemorySync";

interface UseOfflineStoryExitFinalizationOptions {
  activeStoryRef: MutableRefObject<OfflineStory | null>;
  appointments: readonly Appointment[];
  shouldSyncStoryMemory: (story: OfflineStory) => boolean;
  handleSyncMemoryToBrain: (story: OfflineStory, options: { userConfirmed: boolean; syncIntent: "automatic_end" }) => Promise<OfflineStory>;
  onSaveAppointment?: (appointment: Appointment) => boolean;
  onSaveOfflineStory: (story: OfflineStory) => boolean | Promise<boolean>;
  saveActiveStorySnapshot: (story: OfflineStory) => void | Promise<void>;
  showToast: (message: string) => void;
}

export function useOfflineStoryExitFinalization({
  activeStoryRef,
  appointments,
  shouldSyncStoryMemory,
  handleSyncMemoryToBrain,
  onSaveAppointment,
  onSaveOfflineStory,
  saveActiveStorySnapshot,
  showToast,
}: UseOfflineStoryExitFinalizationOptions) {
  const finalizeStoryBeforeLeaving = async (story: OfflineStory): Promise<OfflineStory> => {
    let completedStory = story;
    const handoffCreatedAt = Date.now();
    // Decide from the pre-archive snapshot. A newly-created continuation has
    // real unsynced messages and must schedule its first sync; a legacy story
    // that was already archived must not become a fresh sync candidate merely
    // because this view is being opened and closed again.
    const shouldConsolidateMemory = shouldSyncStoryMemory(completedStory);
    if (!completedStory.archivedAt) {
      completedStory = {
        ...completedStory,
        // Archiving a newly-ended story is not proof of extraction. Preserve
        // the pre-archive cursor before legacy readers see archivedAt.
        lastSyncedMessageCount: completedStory.lastSyncedMessageCount ?? 0,
        archivedAt: handoffCreatedAt,
        updatedAt: handoffCreatedAt,
      };
    }
    if (shouldConsolidateMemory) {
      const handoffSourceMessages = getOfflineHandoffSourceMessagesForReturn(completedStory);
      completedStory = createPendingOfflineHandoff({
        story: completedStory,
        sourceMessages: handoffSourceMessages,
        now: handoffCreatedAt,
      });
    }
    if (completedStory.sourceAppointmentId) {
      const appointment = appointments.find((item) => item.id === completedStory.sourceAppointmentId
        && item.relationId === completedStory.relationId);
      const completedAppointment = appointment
        ? completeAppointmentOfflineSession(appointment, handoffCreatedAt)
        : undefined;
      if (completedAppointment && !onSaveAppointment?.(completedAppointment)) {
        showToast("线下剧情已保存，但约定状态暂时未能更新");
      }
    }
    const saved = await onSaveOfflineStory(completedStory);
    if (!saved) {
      showToast("剧情保存失败，尚未开始记忆整理，请保留当前页面并重试");
      throw new Error("offline_exit_persistence_failed");
    }
    if (activeStoryRef.current?.id === completedStory.id) activeStoryRef.current = completedStory;

    // Persist the scene and bounded handoff before starting heavy extraction.
    // The caller can now return to Online immediately; the existing sync
    // service remains the single automatic consolidation owner and updates
    // this durable story later without copying the transcript again.
    if (shouldConsolidateMemory) {
      void handleSyncMemoryToBrain(completedStory, { userConfirmed: true, syncIntent: "automatic_end" })
        .catch(() => undefined);
    }
    return completedStory;
  };

  return { finalizeStoryBeforeLeaving };
}
