export interface MosslandTtsRequest {
  apiEndpoint?: string;
  apiKey?: string;
  model?: string;
  voiceId?: string;
  text?: string;
}

export class MosslandTtsError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function requireText(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new MosslandTtsError(`缺少 ${label}。`);
  return text;
}

export async function synthesizeMosslandSpeech(
  request: MosslandTtsRequest,
  fetcher: typeof fetch = fetch,
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const apiEndpoint = requireText(request.apiEndpoint || "https://api.mosi.cn/v1/audio/speech", "Mossland 接口地址");
  const apiKey = requireText(request.apiKey, "Mossland API Key");
  const voiceId = requireText(request.voiceId, "Mossland Voice ID");
  const text = requireText(request.text, "待合成文本");
  const endpointUrl = new URL(apiEndpoint);
  if (!['http:', 'https:'].includes(endpointUrl.protocol) || endpointUrl.username || endpointUrl.password) {
    throw new MosslandTtsError("Mossland 接口地址必须是有效的 HTTP(S) 地址。");
  }

  const response = await fetcher(endpointUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model || "moss-tts",
      input: text,
      voice_id: voiceId,
      response_format: "mp3",
      delivery_method: "audio",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new MosslandTtsError(`Mossland API 接口返回错误 (${response.status}): ${errorText}`, response.status);
  }

  return {
    audio: await response.arrayBuffer(),
    contentType: response.headers.get("Content-Type") || "audio/mpeg",
  };
}
