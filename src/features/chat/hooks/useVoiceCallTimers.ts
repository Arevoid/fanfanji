import { useEffect, useRef } from "react";
import { resolveOutgoingCallResolution } from "../services/proactiveVoiceCallPolicy";
import type { VoiceCallStatus } from "../services/messageTypes";

interface UseVoiceCallTimersOptions {
  activeAttachModal: string | null;
  callingStatus: "ringing" | "connected" | "ended";
  isIncomingCall: boolean;
  voiceCallRelationId: string | null;
  transcriptLength: number;
  callTranscriptEndRef: { current: HTMLDivElement | null };
  onDurationTick: () => void;
  onResetDuration: () => void;
  onOutgoingConnected: () => void;
  onOutgoingFinished: (status: VoiceCallStatus) => void;
  onIncomingTimeout: () => void;
}

/** Keeps timers and transcript scrolling out of the chat composition component. */
export function useVoiceCallTimers({
  activeAttachModal,
  callingStatus,
  isIncomingCall,
  voiceCallRelationId,
  transcriptLength,
  callTranscriptEndRef,
  onDurationTick,
  onResetDuration,
  onOutgoingConnected,
  onOutgoingFinished,
  onIncomingTimeout,
}: UseVoiceCallTimersOptions) {
  const durationTickRef = useRef(onDurationTick);
  const resetDurationRef = useRef(onResetDuration);
  const outgoingConnectedRef = useRef(onOutgoingConnected);
  const outgoingFinishedRef = useRef(onOutgoingFinished);
  const incomingTimeoutRef = useRef(onIncomingTimeout);
  durationTickRef.current = onDurationTick;
  resetDurationRef.current = onResetDuration;
  outgoingConnectedRef.current = onOutgoingConnected;
  outgoingFinishedRef.current = onOutgoingFinished;
  incomingTimeoutRef.current = onIncomingTimeout;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (activeAttachModal === "calling" && callingStatus === "connected") timer = setInterval(() => durationTickRef.current(), 1000);
    else resetDurationRef.current();
    return () => { if (timer) clearInterval(timer); };
  }, [activeAttachModal, callingStatus]);

  useEffect(() => {
    if (activeAttachModal !== "calling" || callingStatus !== "ringing" || isIncomingCall || !voiceCallRelationId) return undefined;
    const timer = window.setTimeout(() => {
      const resolution = resolveOutgoingCallResolution(Math.random());
      if (resolution === "connected") outgoingConnectedRef.current();
      else outgoingFinishedRef.current(resolution);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [activeAttachModal, callingStatus, isIncomingCall, voiceCallRelationId]);

  useEffect(() => {
    if (activeAttachModal !== "calling" || callingStatus !== "ringing" || !isIncomingCall || !voiceCallRelationId) return undefined;
    const timer = window.setTimeout(() => incomingTimeoutRef.current(), 30 * 1000);
    return () => window.clearTimeout(timer);
  }, [activeAttachModal, callingStatus, isIncomingCall, voiceCallRelationId]);

  useEffect(() => {
    if (activeAttachModal !== "calling" || callingStatus !== "connected") return;
    requestAnimationFrame(() => callTranscriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  }, [transcriptLength, activeAttachModal, callingStatus, callTranscriptEndRef]);
}
