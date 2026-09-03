import { useState } from "react";

/** Owns transient message-level TTS playback indicators for AppChat. */
export function useChatTtsPlaybackState() {
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [audioLoadingMessageId, setAudioLoadingMessageId] = useState<string | null>(null);
  const [activeTtsAudio, setActiveTtsAudio] = useState<HTMLAudioElement | null>(null);

  return {
    playingMessageId,
    setPlayingMessageId,
    audioLoadingMessageId,
    setAudioLoadingMessageId,
    activeTtsAudio,
    setActiveTtsAudio,
  };
}
