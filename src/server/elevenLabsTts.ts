export interface ElevenLabsTtsRequest {
  apiEndpoint?: string;
  apiKey?: string;
  model?: string;
  voiceId?: string;
  text?: string;
  outputFormat?: string;
}

export class ElevenLabsTtsError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function requireText(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ElevenLabsTtsError(`缺少 ${label}。`);
  return text;
}

function resolveEndpoint(value?: string): URL {
  const raw = (value || "https://api.elevenlabs.io").trim().replace(/\/+$/, "");
  let base: URL;
  try {
    base = new URL(raw);
  } catch {
    throw new ElevenLabsTtsError("ElevenLabs 连接地址必须是有效的 HTTP(S) 地址。");
  }
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
    throw new ElevenLabsTtsError("ElevenLabs 连接地址必须是有效的 HTTP(S) 地址。");
  }
  const pathname = base.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
  return new URL(`${base.origin}${pathname}`);
}

export async function synthesizeElevenLabsSpeech(
  request: ElevenLabsTtsRequest,
  fetcher: typeof fetch = fetch,
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const apiEndpoint = resolveEndpoint(request.apiEndpoint);
  const apiKey = requireText(request.apiKey, "ElevenLabs API Key");
  const voiceId = requireText(request.voiceId, "ElevenLabs Voice ID");
  const text = requireText(request.text, "待合成文本");
  const model = requireText(request.model || "eleven_multilingual_v2", "ElevenLabs 语音模型");
  const outputFormat = (request.outputFormat || "mp3_44100_128").trim();
  const endpoint = new URL(`${apiEndpoint.toString().replace(/\/+$/, "")}/v1/text-to-speech/${encodeURIComponent(voiceId)}`);
  endpoint.searchParams.set("output_format", outputFormat);

  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: model,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ElevenLabsTtsError(`ElevenLabs 接口返回错误 (${response.status}): ${errorText}`, response.status);
  }

  return {
    audio: await response.arrayBuffer(),
    contentType: response.headers.get("Content-Type") || "audio/mpeg",
  };
}
