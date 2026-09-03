import { useEffect, useRef } from "react";
import type { Character, Message, UserSettings } from "../../../types";
import { getSpeechForText } from "../../../utils/minimaxTts";
import { buildCharacterTtsOptions, canPlayTtsMessage, getTtsProvider, resolveTtsCharacter } from "../../voice/ttsConfig";

interface ChatCallSpeechPlaybackOptions {
  settings: UserSettings;
  characters: Character[];
  isOfflineModeActive: boolean;
  playingMessageId: string | null;
  setPlayingMessageId: (id: string | null) => void;
  setAudioLoadingMessageId: (id: string | null) => void;
  activeTtsAudio: HTMLAudioElement | null;
  setActiveTtsAudio: (audio: HTMLAudioElement | null) => void;
  voiceTimer: ReturnType<typeof setInterval> | null;
  setVoiceTimer: (timer: ReturnType<typeof setInterval> | null) => void;
  showToast: (message: string) => void;
}

export function useChatCallSpeechPlayback(options: ChatCallSpeechPlaybackOptions) {
  const callSpeechQueueRef = useRef<Array<{ message: Message; resolve: () => void; generation: number; revealSubtitle: () => void }>>([]);
  const isCallSpeechPlayingRef = useRef(false);
  const activeCallSpeechResolveRef = useRef<(() => void) | null>(null);
  const callTtsAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTtsObjectUrlRef = useRef<string | null>(null);
  const callSpeechGenerationRef = useRef(0);

  const unlockCallTtsPlayback = () => {
    if (typeof Audio === "undefined") return;
    const silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";
    const audio = callTtsAudioRef.current || new Audio();
    callTtsAudioRef.current = audio;
    audio.onended = null;
    audio.onerror = null;
    audio.src = silentWav;
    audio.preload = "auto";
    void audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch((error) => {
      console.warn("Call audio unlock failed:", error);
    });
  };

  const resetCallTtsPlayback = () => {
    const audio = callTtsAudioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
    }
    if (callTtsObjectUrlRef.current) {
      URL.revokeObjectURL(callTtsObjectUrlRef.current);
      callTtsObjectUrlRef.current = null;
    }
    callTtsAudioRef.current = null;
    options.setActiveTtsAudio(null);
  };

  const playNextMessageInQueue = (currentId: string) => {
    options.setPlayingMessageId(null);
    options.setActiveTtsAudio(null);
  };

  const triggerMessageSpeech = async (
    msg: Message,
    isQueuedCallSpeech = false,
    callSpeechGeneration = callSpeechGenerationRef.current,
    revealCallSubtitle?: () => void,
  ): Promise<void> => {
    let objectUrl: string | null = null;
    let callSubtitleRevealed = false;
    const revealCallSubtitleOnce = () => {
      if (!isQueuedCallSpeech || callSubtitleRevealed) return;
      callSubtitleRevealed = true;
      revealCallSubtitle?.();
    };
    const isCancelledCallSpeech = () => isQueuedCallSpeech && callSpeechGeneration !== callSpeechGenerationRef.current;
    const releaseObjectUrl = () => {
      if (!objectUrl) return;
      URL.revokeObjectURL(objectUrl);
      if (callTtsObjectUrlRef.current === objectUrl) callTtsObjectUrlRef.current = null;
      objectUrl = null;
    };
    let queuedCallSpeechFinished = false;
    const finishQueuedCallSpeechOnce = () => {
      if (!isQueuedCallSpeech || queuedCallSpeechFinished) return;
      queuedCallSpeechFinished = true;
      finishQueuedCallSpeech();
    };

    const isVoice = Boolean(msg.content && (msg.content.startsWith("[语音") || msg.isVoiceMessage));
    if (!canPlayTtsMessage({ isOfflineModeActive: options.isOfflineModeActive, isVoiceMessage: isVoice, isQueuedCallSpeech })) {
      revealCallSubtitleOnce();
      return;
    }
    if (msg.sender === "character" && !options.settings.enableMiniMaxTts) {
      revealCallSubtitleOnce();
      finishQueuedCallSpeechOnce();
      return;
    }
    if (options.playingMessageId === msg.id) {
      options.activeTtsAudio?.pause();
      if (options.voiceTimer) {
        clearInterval(options.voiceTimer);
        options.setVoiceTimer(null);
      }
      options.setPlayingMessageId(null);
      return;
    }
    if (options.activeTtsAudio && !isQueuedCallSpeech) {
      options.activeTtsAudio.pause();
      options.setActiveTtsAudio(null);
    }
    if (options.voiceTimer && !isQueuedCallSpeech) {
      clearInterval(options.voiceTimer);
      options.setVoiceTimer(null);
    }
    if (msg.sender === "user" && msg.content?.startsWith("[语音]|")) {
      options.setPlayingMessageId(msg.id);
      options.setAudioLoadingMessageId(null);
      const parts = msg.content.split("|");
      let countdown = parseInt(parts[1] || "3", 10);
      const interval = setInterval(() => {
        countdown -= 1;
        if (countdown <= 0) {
          options.setPlayingMessageId(null);
          clearInterval(interval);
          options.setVoiceTimer(null);
        }
      }, 1000);
      options.setVoiceTimer(interval);
      return;
    }

    options.setPlayingMessageId(msg.id);
    options.setAudioLoadingMessageId(msg.id);
    let ttsProviderName = "MiniMax";
    try {
      ttsProviderName = getTtsProvider(options.settings) === "mossland" ? "Mossland" : "MiniMax";
      const msgChar = resolveTtsCharacter(options.characters, msg.characterId, msg.senderId);
      const ttsOptions = buildCharacterTtsOptions(options.settings, msgChar);
      let cleanText = msg.content;
      if (cleanText.startsWith("[语音]|")) cleanText = cleanText.split("|").slice(2).join("|") || "";
      cleanText = cleanText.replace(/\([^\)]*\)/g, "").replace(/（[^）]*）/g, "").trim();
      if (!cleanText) {
        revealCallSubtitleOnce();
        options.setPlayingMessageId(null);
        options.setAudioLoadingMessageId(null);
        if (isQueuedCallSpeech) finishQueuedCallSpeechOnce(); else playNextMessageInQueue(msg.id);
        return;
      }
      const blob = await getSpeechForText(cleanText, ttsOptions);
      if (isCancelledCallSpeech()) return;
      objectUrl = URL.createObjectURL(blob);
      if (isQueuedCallSpeech) callTtsObjectUrlRef.current = objectUrl;
      const audio = isQueuedCallSpeech ? (callTtsAudioRef.current || new Audio()) : new Audio();
      if (isQueuedCallSpeech) callTtsAudioRef.current = audio;
      audio.onended = null;
      audio.onerror = null;
      audio.src = objectUrl;
      audio.preload = "auto";
      options.setActiveTtsAudio(audio);
      options.setAudioLoadingMessageId(null);
      audio.onended = () => {
        releaseObjectUrl();
        if (isQueuedCallSpeech) finishQueuedCallSpeechOnce(); else playNextMessageInQueue(msg.id);
      };
      audio.onerror = (event) => {
        console.warn("Audio playback error:", event);
        releaseObjectUrl();
        options.setPlayingMessageId(null);
        options.setAudioLoadingMessageId(null);
        if (isQueuedCallSpeech) finishQueuedCallSpeechOnce();
      };
      const playback = audio.play();
      revealCallSubtitleOnce();
      await playback;
    } catch (error) {
      console.warn("TTS generation failed:", error);
      releaseObjectUrl();
      if (isCancelledCallSpeech()) return;
      revealCallSubtitleOnce();
      options.setPlayingMessageId(null);
      options.setAudioLoadingMessageId(null);
      if (isQueuedCallSpeech) finishQueuedCallSpeechOnce();
      const detail = error instanceof Error ? error.message.replace(/\s+/g, " ").trim().slice(0, 120) : "";
      options.showToast(detail || `语音合成失败，请确认 ${ttsProviderName} 设置正确！`);
    }
  };

  const playNextQueuedCallSpeech = () => {
    if (isCallSpeechPlayingRef.current) return;
    const nextJob = callSpeechQueueRef.current.shift();
    if (!nextJob) return;
    isCallSpeechPlayingRef.current = true;
    activeCallSpeechResolveRef.current = nextJob.resolve;
    void triggerMessageSpeech(nextJob.message, true, nextJob.generation, nextJob.revealSubtitle);
  };

  const finishQueuedCallSpeech = () => {
    const resolve = activeCallSpeechResolveRef.current;
    activeCallSpeechResolveRef.current = null;
    isCallSpeechPlayingRef.current = false;
    options.setPlayingMessageId(null);
    options.setActiveTtsAudio(null);
    resolve?.();
    window.setTimeout(playNextQueuedCallSpeech, 0);
  };

  const enqueueCallSpeech = (msg: Message, revealSubtitle: () => void): Promise<void> => new Promise((resolve) => {
    callSpeechQueueRef.current.push({ message: msg, resolve, generation: callSpeechGenerationRef.current, revealSubtitle });
    playNextQueuedCallSpeech();
  });

  const clearCallSpeechQueue = () => {
    callSpeechGenerationRef.current += 1;
    activeCallSpeechResolveRef.current?.();
    activeCallSpeechResolveRef.current = null;
    callSpeechQueueRef.current.splice(0).forEach((job) => job.resolve());
    isCallSpeechPlayingRef.current = false;
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) options.activeTtsAudio?.pause();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      options.activeTtsAudio?.pause();
    };
  }, [options.activeTtsAudio]);

  return { triggerMessageSpeech, unlockCallTtsPlayback, resetCallTtsPlayback, enqueueCallSpeech, clearCallSpeechQueue, callSpeechGenerationRef };
}
