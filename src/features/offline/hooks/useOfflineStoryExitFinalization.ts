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
    if (shouldSyncStoryMemory(story)) {
      // The exit path is the single automatic sync owner. Await it before
      // creating the handoff so a second exit cannot race the first write and
      // append another copy of the same offline memory.
      completedStory = await handleSyncMemoryToBrain(story, { userConfirmed: true, syncIntent: "automatic_end" });
    }
    const handoffCreatedAt = Date.now();
    if (!completedStory.archivedAt) {
      completedStory = {
        ...completedStory,
        archivedAt: handoffCreatedAt,
        updatedAt: handoffCreatedAt,
      };
    }
    const handoffSourceMessages = getOfflineHandoffSourceMessagesForReturn(completedStory);
    completedStory = createPendingOfflineHandoff({
      story: completedStory,
      sourceMessages: handoffSourceMessages,
      now: handoffCreatedAt,
    });
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
    if (activeStoryRef.current?.id === completedStory.id) saveActiveStorySnapshot(completedStory);
    else onSaveOfflineStory(completedStory);
    return completedStory;
  };

  return { finalizeStoryBeforeLeaving };
}
