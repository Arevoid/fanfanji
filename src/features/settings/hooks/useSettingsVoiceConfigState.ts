import { useState } from "react";
import type { UserSettings } from "../../../types";

export function useSettingsVoiceConfigState(settings: UserSettings) {
  const [enableMiniMaxTts, setEnableMiniMaxTts] = useState(!!settings.enableMiniMaxTts);
  const [ttsProvider, setTtsProvider] = useState<"minimax" | "mossland">(settings.ttsProvider === "mossland" ? "mossland" : "minimax");
  const [minimaxApiKey, setMinimaxApiKey] = useState(settings.minimaxApiKey || "");
  const [minimaxGroupId, setMinimaxGroupId] = useState(settings.minimaxGroupId || "");
  const [minimaxModel, setMinimaxModel] = useState(settings.minimaxModel || "speech-2.8-hd");
  const [minimaxSpeed, setMinimaxSpeed] = useState(settings.minimaxSpeed !== undefined ? settings.minimaxSpeed : 1.0);
  const [minimaxPitch, setMinimaxPitch] = useState(settings.minimaxPitch !== undefined ? settings.minimaxPitch : 0);
  const [minimaxVol, setMinimaxVol] = useState(settings.minimaxVol !== undefined ? settings.minimaxVol : 1.0);
  const minimaxProxyUrl = settings.minimaxProxyUrl || "";
  const [mosslandApiEndpoint, setMosslandApiEndpoint] = useState(settings.mosslandApiEndpoint || "https://api.mosi.cn/v1/audio/speech");
  const [mosslandApiKey, setMosslandApiKey] = useState(settings.mosslandApiKey || "");
  const [mosslandModel, setMosslandModel] = useState(settings.mosslandModel || "moss-tts");
  const [showMosslandPassword, setShowMosslandPassword] = useState(false);

  return {
    enableMiniMaxTts, setEnableMiniMaxTts, ttsProvider, setTtsProvider,
    minimaxApiKey, setMinimaxApiKey, minimaxGroupId, setMinimaxGroupId, minimaxModel, setMinimaxModel,
    minimaxSpeed, setMinimaxSpeed, minimaxPitch, setMinimaxPitch, minimaxVol, setMinimaxVol, minimaxProxyUrl,
    mosslandApiEndpoint, setMosslandApiEndpoint, mosslandApiKey, setMosslandApiKey, mosslandModel, setMosslandModel,
    showMosslandPassword, setShowMosslandPassword,
  };
}
