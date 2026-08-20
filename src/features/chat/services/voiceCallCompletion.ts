import type { Message } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { createCallRecordMarkup, getCallTranscriptText, type CallTranscriptItem } from "./messageParser";
import { createProactiveCallRejectionPatch, isEmotionallyChargedCallContext } from "./proactiveVoiceCallPolicy";
import { createVoiceCallRecordMessage, type DirectVoiceCallScope } from "./voiceCallScope";
import type { VoiceCallStatus } from "./messageTypes";

export function completeVoiceCall(input: {
  requestedStatus: VoiceCallStatus;
  transcript: readonly CallTranscriptItem[];
  durationSeconds: number;
  id: string;
  characterId: string;
  scope: DirectVoiceCallScope;
  sender: "user" | "character";
  timestamp: number;
  incoming: boolean;
  userEndedCall?: boolean;
  recentMessages: readonly Message[];
}): { status: VoiceCallStatus; callRecord: Message; rejectionPatch?: Partial<CharacterRelationship> } {
  const meaningfulTranscript = input.transcript.filter((item) => getCallTranscriptText(item.content || "").trim());
  const status: VoiceCallStatus = input.requestedStatus === "completed" && meaningfulTranscript.length === 0
    ? "cancelled"
    : input.requestedStatus;
  const minutes = Math.floor(input.durationSeconds / 60).toString().padStart(2, "0");
  const seconds = (input.durationSeconds % 60).toString().padStart(2, "0");
  const callRecord = createVoiceCallRecordMessage({
    id: input.id,
    characterId: input.characterId,
    scope: input.scope,
    sender: input.sender,
    content: createCallRecordMarkup({
      callType: "语音通话",
      status,
      direction: input.incoming ? "incoming" : "outgoing",
      duration: `${minutes}:${seconds}`,
      transcript: meaningfulTranscript,
    }),
    timestamp: input.timestamp,
  });
  const recentContext = input.recentMessages
    .filter((message) => message.relationId === input.scope.relationId && !message.isOffline)
    .slice(-12)
    .map((message) => message.content)
    .concat(input.transcript.map((item) => getCallTranscriptText(item.content || "")))
    .join("\n");
  return {
    status,
    callRecord,
    ...(input.incoming && (status !== "completed" || input.userEndedCall)
      ? { rejectionPatch: createProactiveCallRejectionPatch(input.timestamp, isEmotionallyChargedCallContext(recentContext)) }
      : {}),
  };
}
