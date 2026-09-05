import type { Message, UserSettings } from "../../../types";
import { apiTranslate } from "../../../utils/apiHelper";

interface UseChatMessageTranslationOptions {
  settings: UserSettings;
  onUpdateMessage?: (messageId: string, patch: { translation: string }, original: Message) => void;
  showToast: (message: string) => void;
}

export function useChatMessageTranslation({ settings, onUpdateMessage, showToast }: UseChatMessageTranslationOptions) {
  const handleTranslateMessage = (msg: Message) => {
    if (!onUpdateMessage) return;
    
    showToast("正在翻译中...");
    
    apiTranslate({
      text: msg.content,
      apiKey: settings.apiKey || "",
      model: settings.selectedModel,
      apiEndpoint: settings.apiEndpoint
    })
    .then(res => {
      if (res && res.text) {
        onUpdateMessage(msg.id, { translation: res.text }, msg);
        showToast("翻译完成");
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

