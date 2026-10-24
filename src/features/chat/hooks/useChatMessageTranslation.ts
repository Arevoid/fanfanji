import {resolveCharacterApiSettings} from "../../../domain/character/characterApiSettings";
import type { Character, Message, UserSettings } from "../../../types";
import { apiTranslate } from "../../../utils/apiHelper";
import { getVoiceMessagePreview, isVoiceMessageContent } from "../services/voiceMessageContent";
import { sanitizeCharacterActionText } from "../services/characterActionProtocol";

interface UseChatMessageTranslationOptions {
  settings: UserSettings;
  character?: Character;
  characters?: readonly Character[];
  onUpdateMessage?: (messageId: string, patch: { translation: string }, original: Message) => void;
  onTranslationReady?: (message: Message, translatedText: string) => void;
  showToast: (message: string) => void;
}

export function useChatMessageTranslation({ settings:globalSettings, character,characters, onUpdateMessage, onTranslationReady, showToast }: UseChatMessageTranslationOptions) {
  const handleTranslateMessage = (msg: Message) => {
    if (!onUpdateMessage) return;
    let settings;try{settings=resolveCharacterApiSettings(globalSettings,character,characters);}catch(error){showToast(error instanceof Error?error.message:"API configuration invalid");return;}

    if (msg.translation?.trim()) {
      onTranslationReady?.(msg, msg.translation.trim());
      showToast("已显示已有译文");
      return;
    }
    
    const isVoice = isVoiceMessageContent(msg.content, msg.isVoiceMessage === true, Boolean(msg.audioUrl));
    const sourceText = sanitizeCharacterActionText(
      isVoice ? getVoiceMessagePreview(msg.content, msg.audioDuration).transcript : msg.content.trim(),
    );
    if (!sourceText) {
      showToast(isVoice ? "语音暂无可翻译文本，请先语音转文字" : "翻译无内容");
      return;
    }

    showToast("正在翻译中...");
    
    apiTranslate({
      text: sourceText,
      apiKey: settings.apiKey || "",
      model: settings.selectedModel,
      apiEndpoint: settings.apiEndpoint
    })
    .then(res => {
      const translatedText = sanitizeCharacterActionText(res?.text?.trim() || "");
      if (translatedText && translatedText !== sourceText) {
        onUpdateMessage(msg.id, { translation: translatedText }, msg);
        onTranslationReady?.({ ...msg, translation: translatedText }, translatedText);
        showToast("翻译完成");
      } else if (translatedText) {
        showToast("翻译结果与原文相同");
      } else {
        showToast("翻译无结果");
      }
    })
    .catch(err => {
      console.error("Translate message failed:", err);
      showToast(err instanceof Error ? err.message : "翻译失败，请检查 API 配置");
    });
  };


  return { handleTranslateMessage };
}

