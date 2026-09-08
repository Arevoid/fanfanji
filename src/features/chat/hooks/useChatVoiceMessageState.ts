import { useState } from "react";

export function useChatVoiceMessageState() {
  const [voicePlayed, setVoicePlayed] = useState<Record<string, boolean>>({});
  const [voiceTranscribed, setVoiceTranscribed] = useState<Record<string, boolean>>({});

  return { voicePlayed, setVoicePlayed, voiceTranscribed, setVoiceTranscribed };
}
