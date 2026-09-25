import { useRef, useState } from "react";
import type { Message } from "../../../types";
import type { RedPacketMode } from "../../../types";
import { parseCallRecord, type CallTranscriptItem } from "../services/messageParser";
import type { VideoCallSceneEntry } from "../services/videoCallProtocol";

export type ChatAttachmentModal = "redpacket" | "music" | "location" | "file" | "calling" | "voice" | null;
export type ChatCallMode = "voice" | "video";
export type VideoCallInputMode = "speech" | "scene";

export function useChatAttachmentState() {
  const [showImageGenerator, setShowImageGenerator] = useState(false);
  const [imageRequestText, setImageRequestText] = useState("");
  const [imageGenerationError, setImageGenerationError] = useState<string | null>(null);
  const [showAttachPanel, setShowAttachPanel] = useState(false);
  const [activeAttachModal, setActiveAttachModal] = useState<ChatAttachmentModal>(null);
  const [voiceText, setVoiceText] = useState("");
  const [callingStatus, setCallingStatus] = useState<"ringing" | "connected" | "ended">("ringing");
  const [callingDuration, setCallingDuration] = useState(0);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [, setCallStartTime] = useState(0);
  const [callingInputText, setCallingInputText] = useState("");
  const [callMode, setCallMode] = useState<ChatCallMode>("voice");
  const [videoCallInputMode, setVideoCallInputMode] = useState<VideoCallInputMode>("speech");
  const [callTranscript, setCallTranscript] = useState<CallTranscriptItem[]>([]);
  const [videoCallScene, setVideoCallScene] = useState("");
  const [videoCallSelfScene, setVideoCallSelfScene] = useState("");
  const [videoCallSceneHistory, setVideoCallSceneHistory] = useState<VideoCallSceneEntry[]>([]);
  const [voiceCallRelationId, setVoiceCallRelationId] = useState<string | null>(null);
  const callTranscriptEndRef = useRef<HTMLDivElement | null>(null);
  const [callRecordDetail, setCallRecordDetail] = useState<ReturnType<typeof parseCallRecord> | null>(null);
  const [redPacketAmount, setRedPacketAmount] = useState("8.88");
  const [redPacketGreeting, setRedPacketGreeting] = useState("恭喜发财，万事如意");
  const [redPacketMode, setRedPacketMode] = useState<RedPacketMode>("lucky");
  const [redPacketCount, setRedPacketCount] = useState("1");
  const [redPacketRecipientId, setRedPacketRecipientId] = useState("");
  const [showRedPacketOpenModal, setShowRedPacketOpenModal] = useState(false);
  const [openRedPacketDetail, setOpenRedPacketDetail] = useState<{
    id: string; amount: string; greeting: string; senderName: string; senderAvatar: string;
    sender: "user" | "character"; timestamp: number; message: Message; mode: RedPacketMode;
    count: number; recipientId?: string; recipientName?: string;
  } | null>(null);
  const [isOpeningRedPacket, setIsOpeningRedPacket] = useState(false);
  const [, setOpenTransferDetail] = useState<{ amount: string; memo: string; isConfirmed: boolean } | null>(null);
  const [, setShowTransferDetailModal] = useState(false);
  const [, setOpenVoiceId] = useState<string | null>(null);
  const [voiceTimer, setVoiceTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  return {
    showImageGenerator, setShowImageGenerator, imageRequestText, setImageRequestText,
    imageGenerationError, setImageGenerationError,
    showAttachPanel, setShowAttachPanel, activeAttachModal, setActiveAttachModal,
    voiceText, setVoiceText, callingStatus, setCallingStatus, callingDuration, setCallingDuration,
    isIncomingCall, setIsIncomingCall, setCallStartTime, callingInputText, setCallingInputText,
    callMode, setCallMode, videoCallInputMode, setVideoCallInputMode,
    callTranscript, setCallTranscript, videoCallScene, setVideoCallScene, videoCallSelfScene, setVideoCallSelfScene,
    videoCallSceneHistory, setVideoCallSceneHistory, voiceCallRelationId, setVoiceCallRelationId, callTranscriptEndRef,
    callRecordDetail, setCallRecordDetail, redPacketAmount, setRedPacketAmount,
    redPacketGreeting, setRedPacketGreeting, redPacketMode, setRedPacketMode, redPacketCount, setRedPacketCount,
    redPacketRecipientId, setRedPacketRecipientId, showRedPacketOpenModal, setShowRedPacketOpenModal,
    openRedPacketDetail, setOpenRedPacketDetail, isOpeningRedPacket, setIsOpeningRedPacket,
    setOpenTransferDetail, setShowTransferDetailModal, setOpenVoiceId, voiceTimer, setVoiceTimer,
  };
}
