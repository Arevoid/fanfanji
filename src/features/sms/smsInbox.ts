import type { SmsMessage, SmsTimeline } from "../../domain/sms/smsTypes";

export interface SmsConversationActivity {
  latestTimeline?: SmsTimeline;
  latestMessage?: SmsMessage;
  unreadCount: number;
  lastActivityAt: number;
}

/**
 * Calculates inbox activity across every timeline for one character. A newly
 * created but empty timeline must never receive a current timestamp, otherwise
 * it would incorrectly jump above conversations that contain real messages.
 */
export function resolveSmsConversationActivity(
  timelines: readonly SmsTimeline[],
  messages: readonly SmsMessage[],
): SmsConversationActivity {
  const timelineIds = new Set(timelines.map((timeline) => timeline.id));
  const latestTimeline = [...timelines].sort((left, right) =>
    right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
  )[0];
  const scopedMessages = messages.filter((message) => timelineIds.has(message.timelineId));
  const latestMessage = scopedMessages.reduce<SmsMessage | undefined>((latest, message) =>
    !latest || message.receivedAt > latest.receivedAt ? message : latest,
  undefined);
  const unreadCount = scopedMessages.filter((message) => message.sender === "character" && !message.readAt).length;
  return {
    latestTimeline,
    latestMessage,
    unreadCount,
    lastActivityAt: latestMessage?.receivedAt ?? latestTimeline?.updatedAt ?? 0,
  };
}
