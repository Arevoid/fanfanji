import type { Character, Message, UserSettings } from "../../../types";
import { getCallTranscriptText } from "./messageParser";
import { getVideoCallDisplayText, parseVideoCallResponse } from "./videoCallProtocol";
import { attachDirectScope, type DirectInteractionScope } from "../context/directInteractionScope";
import { shouldQueueCallSpeech } from "../../voice/ttsConfig";

export interface CallTranscriptEntry {
  id: string;
  sender: Message["sender"];
  content: string;
  timestamp: number;
}

export interface ChatMessageDeliveryOptions {
  settings: UserSettings;
  activeCharacter?: Character;
  activeDirectScope: DirectInteractionScope | null | undefined;
  activeAttachModal: string | null;
  callingStatus: string | null;
  callMode?: "voice" | "video";
  onSendMessageRaw: (message: Message) => void;
  setCallTranscript: (update: (previous: CallTranscriptEntry[]) => CallTranscriptEntry[]) => void;
  setCallScene?: (scene: string) => void;
  setCallSceneHistory?: (update: (previous: Array<{ id: string; content: string; timestamp: number }>) => Array<{ id: string; content: string; timestamp: number }>) => void;
  enqueueCallSpeech: (message: Message, revealSubtitle: () => void) => Promise<void>;
}

const normalizeVoiceMarkup = (content: string): string => {
  if (!content.startsWith("[语音") || content.startsWith("[语音]|")) return content;

  let text = "";
  let seconds = 5;
  const match1 = content.match(/^\[语音:\s*"([^"]+)"\s*\((\d+)(?:秒|s)\)\]/i);
  const match2 = content.match(/^\[语音:\s*(.+?)\s*\((\d+)(?:秒|s)\)\]/i);
  const match3 = content.match(/^\[语音:\s*(\d+)(?:秒|s)\]/i);
  const match4 = content.match(/^\[语音:\s*"([^"]+)"\]/i) || content.match(/^\[语音:\s*(.+?)\]/i);

  if (match1) {
    text = match1[1];
    seconds = parseInt(match1[2], 10) || 5;
  } else if (match2) {
    text = match2[1];
    seconds = parseInt(match2[2], 10) || 5;
  } else if (match3) {
    seconds = parseInt(match3[1], 10) || 5;
  } else if (match4) {
    text = match4[1];
    seconds = Math.max(1, Math.min(60, Math.ceil(text.length * 0.35 + 1.2)));
  } else {
    text = content.replace(/^\[语音\]\s*/, "").replace(/^\[语音:\s*/, "").replace(/\]$/, "").trim();
    seconds = Math.max(1, Math.min(60, Math.ceil(text.length * 0.35 + 1.2)));
  }
  return `[语音]|${seconds}|${text}`;
};

export function createChatMessageDeliveryHandler(options: ChatMessageDeliveryOptions) {
  return (message: Message): Promise<void> | void => {
    const normalizedMessage = { ...message, content: normalizeVoiceMarkup(message.content || "") };
    const isCallActive = options.activeAttachModal === "calling" && options.callingStatus === "connected";

    if (
      isCallActive
      && normalizedMessage.sender === "character"
      && (/^\[(?:表情|贴图|图片)\]/.test(normalizedMessage.content) || normalizedMessage.content.startsWith("data:image/"))
    ) return;

    if (isCallActive) {
      const rawSubtitleContent = getCallTranscriptText(normalizedMessage.content);
      const parsedVideo = options.callMode === "video" && normalizedMessage.sender === "character"
        ? parseVideoCallResponse(rawSubtitleContent)
        : undefined;
      if (parsedVideo?.scene) {
        options.setCallScene?.(parsedVideo.scene);
        options.setCallSceneHistory?.((previous) => previous.some((item) => item.id === normalizedMessage.id)
          ? previous
          : [...previous, { id: normalizedMessage.id, content: parsedVideo.scene!, timestamp: normalizedMessage.timestamp }]);
      }
      const subtitleContent = parsedVideo ? parsedVideo.speech : getVideoCallDisplayText(rawSubtitleContent);
      // Keep the visual part in the dialogue area as well as the central scene
      // label. This makes camera/scene turns readable after the scene changes,
      // while speech playback still receives only the spoken text.
      const transcriptContent = parsedVideo
        ? [parsedVideo.scene ? `画面：${parsedVideo.scene}` : "", parsedVideo.speech].filter(Boolean).join("\n")
        : subtitleContent;
      if (!transcriptContent.trim()) return;
      let subtitleCommitted = false;
      const commitSubtitleOnce = () => {
        if (subtitleCommitted) return;
        subtitleCommitted = true;
        options.setCallTranscript((previous) => previous.some((item) => item.id === normalizedMessage.id)
          ? previous
          : [...previous, {
            id: normalizedMessage.id,
            sender: normalizedMessage.sender,
            content: transcriptContent,
            timestamp: normalizedMessage.timestamp,
          }]);
      };

      if (subtitleContent.trim() && options.settings.enableMiniMaxTts && shouldQueueCallSpeech(normalizedMessage.sender, subtitleContent)) {
        return options.enqueueCallSpeech({ ...normalizedMessage, content: subtitleContent }, commitSubtitleOnce);
      }
      commitSubtitleOnce();
      return;
    }

    if (!options.activeCharacter?.isGroupChat) {
      if (!options.activeDirectScope) return;
      const scopedMessage = attachDirectScope(normalizedMessage, options.activeDirectScope);
      if (!scopedMessage) return;
      options.onSendMessageRaw(scopedMessage);
      return;
    }

    const { relationId: _relationId, ...groupMessage } = normalizedMessage;
    options.onSendMessageRaw({ ...groupMessage, conversationId: `group:${options.activeCharacter.id}` });
  };
}

export { normalizeVoiceMarkup };
