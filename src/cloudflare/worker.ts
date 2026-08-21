import { assertImageGenerationTrigger } from "../features/chat/services/imageGenerationIntent";
import { ImageApiError, fetchImageModels, generateImageWithProtocol, testImageConnectionWithProtocol } from "../server/imageProtocolAdapters";
import { MosslandTtsError, synthesizeMosslandSpeech } from "../server/mosslandTts";
import { buildKnowledgeExtractionPrompt, parseOrRepairKnowledgeExtractionOutput } from "../features/characterKnowledge/services/knowledgeExtractionProtocol";
import { buildTranslationPrompt, callTextProvider, fetchTextModels, TextApiError } from "../server/textProtocolAdapters";
import { API_REQUEST_TIMEOUTS, fetchWithTimeout } from "../utils/fetchWithTimeout";
import { CONTENT_SECURITY_POLICY } from "../core/security/contentSecurityPolicy";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Content-Security-Policy": CONTENT_SECURITY_POLICY } });
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function requestBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await request.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function errorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  const imageError = error instanceof ImageApiError ? error : null;
  const status = imageError?.status || 400;
  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  return json({ success: false, code: imageError?.code || fallbackCode, error: message }, status);
}

function textErrorResponse(error: unknown, fallbackMessage: string) {
  const status = error instanceof TextApiError ? error.status : 500;
  return json({ success: false, error: error instanceof Error ? error.message : fallbackMessage }, status);
}

const textInput = (body: Record<string, unknown>, message: string, systemInstruction?: string, temperature?: number) => ({
  message,
  history: Array.isArray(body.history) ? body.history as any[] : [],
  systemInstruction,
  apiKey: String(body.apiKey || ""),
  model: String(body.model || ""),
  apiEndpoint: typeof body.apiEndpoint === "string" ? body.apiEndpoint : undefined,
  temperature,
  streamCompatible: body.streamCompatible === true,
  imageDataUrl: typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/") ? body.imageDataUrl : undefined,
});

async function synthesizeMinimax(body: Record<string, unknown>): Promise<Response> {
  const apiKey = String(body.apiKey || "").trim();
  const groupId = String(body.groupId || "").trim();
  if (!apiKey || !groupId) return json({ error: "请填写 MiniMax API Key 和 Group ID。" }, 400);
  const response = await fetchWithTimeout(`https://api.minimax.chat/v1/t2a_v2?GroupId=${encodeURIComponent(groupId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: String(body.model || "speech-2.8-hd"), text: String(body.text || ""), stream: false,
      voice_setting: { voice_id: String(body.voiceId || "female-shaonv"), speed: Number(body.speed ?? 1), vol: Number(body.vol ?? 1), pitch: Number(body.pitch ?? 0) },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3" },
    }),
  }, API_REQUEST_TIMEOUTS.speechSynthesis);
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data?.data?.audio) return json({ error: data?.base_resp?.status_msg || data?.error || "MiniMax 未返回音频。" }, response.ok ? 502 : response.status);
  const value = String(data.data.audio);
  let bytes: Uint8Array;
  if (/^[0-9a-f]+$/i.test(value)) bytes = Uint8Array.from({ length: value.length / 2 }, (_, index) => parseInt(value.slice(index * 2, index * 2 + 2), 16));
  else {
    const binary = atob(value);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Content-Security-Policy": CONTENT_SECURITY_POLICY } });
}

/**
 * Cloudflare deployment entry point. Provider proxy routes execute in the
 * Worker; all other requests stay on static assets.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET") {
      return json({ status: "ok", service: "fanfanji-worker", version: "0.0.0" });
    }
    const isImageRoute = url.pathname.startsWith("/api/image/");
    const isMosslandRoute = url.pathname === "/api/mossland-tts";
    const isTextRoute = ["/api/chat", "/api/translate", "/api/test-key", "/api/models", "/api/extract-memories", "/api/summarize-personality"].includes(url.pathname);
    const isMinimaxRoute = url.pathname === "/api/minimax-tts";
    if (!isImageRoute && !isMosslandRoute && !isTextRoute && !isMinimaxRoute) return withSecurityHeaders(await env.ASSETS.fetch(request));
    if (request.method !== "POST") return json({ success: false, error: "代理接口只接受 POST 请求。" }, 405);

    const body = await requestBody(request);
    if (!body) return json({ success: false, error: "代理请求格式无效。" }, 400);

    if (isMinimaxRoute) return synthesizeMinimax(body);

    if (url.pathname === "/api/chat") {
      try {
        const text = await callTextProvider(textInput(body, String(body.message || ""), typeof body.systemInstruction === "string" ? body.systemInstruction : undefined, typeof body.apiTemperature === "number" ? body.apiTemperature : 0.7));
        return json({ text });
      } catch (error) { return textErrorResponse(error, "聊天 API 请求失败。"); }
    }

    if (url.pathname === "/api/translate") {
      try {
        const targetLanguage = typeof body.targetLanguage === "string" && body.targetLanguage.trim() ? body.targetLanguage : "zh-CN";
        const text = await callTextProvider(textInput(body, buildTranslationPrompt(String(body.text || ""), targetLanguage), `你是翻译助手，只输出目标语言 ${targetLanguage} 的译文。`, 0.3));
        return json({ text });
      } catch (error) { return textErrorResponse(error, "翻译 API 请求失败。"); }
    }

    if (url.pathname === "/api/test-key") {
      try {
        await callTextProvider(textInput(body, "Reply with OK only.", undefined, 0.1));
        return json({ success: true, message: "连接成功，所选模型可正常生成文本。" });
      } catch (error) { return textErrorResponse(error, "连接测试失败。"); }
    }

    if (url.pathname === "/api/models") {
      try {
        const models = await fetchTextModels({ apiKey: String(body.apiKey || ""), apiEndpoint: typeof body.apiEndpoint === "string" ? body.apiEndpoint : undefined });
        return json({ success: true, models });
      } catch (error) { return textErrorResponse(error, "模型列表获取失败。"); }
    }

    if (url.pathname === "/api/extract-memories") {
      try {
        const history = Array.isArray(body.history) ? body.history as any[] : [];
        const prompt = buildKnowledgeExtractionPrompt({
          characterName: String(body.characterName || "角色"), characterProfile: typeof body.characterProfile === "string" ? body.characterProfile : undefined,
          history, templateType: body.templateType === "delicate" ? "delicate" : "refined", scenario: body.scenario === "offline" ? "offline" : undefined,
        });
        const text = await callTextProvider(textInput(body, prompt, "你是长期记忆提取器，严格按要求输出结构化候选。", 0.5));
        const repaired = await parseOrRepairKnowledgeExtractionOutput({
          rawText: text,
          allowedMessageIds: new Set(history.map((item) => String(item.id))),
          originalPrompt: prompt,
          repair: (repairPrompt) => callTextProvider(textInput(body, repairPrompt, "你是结构化记忆修复器。只输出可验证的 JSONL，不要解释。", 0.2)),
        });
        return json({ text: repaired.text, items: repaired.candidates, candidates: repaired.candidates, repaired: repaired.repaired });
      } catch (error) { return textErrorResponse(error, "记忆提取失败。"); }
    }

    if (url.pathname === "/api/summarize-personality") {
      try {
        const references = Array.isArray(body.references) ? body.references as Array<Record<string, unknown>> : [];
        if (!references.length) return json({ error: "请至少添加一条参考内容。" }, 400);
        const source = references.map((item, index) => `[参考 ${index + 1}：${String(item.title || "未命名")}]\n${String(item.content || "")}`).join("\n\n");
        const text = await callTextProvider(textInput(body, `根据以下参考资料提炼可直接作为角色系统设定的人设与说话特征。只输出设定正文。\n\n${source}`, "你是角色设定提炼专家。", 0.5));
        return json({ text });
      } catch (error) { return textErrorResponse(error, "人设总结失败。"); }
    }

    if (isMosslandRoute) {
      try {
        const result = await synthesizeMosslandSpeech(body);
        return new Response(result.audio, {
          headers: { "Content-Type": result.contentType, "Cache-Control": "no-store", "Content-Security-Policy": CONTENT_SECURITY_POLICY },
        });
      } catch (error) {
        const status = error instanceof MosslandTtsError ? error.status : 500;
        const message = error instanceof Error ? error.message : "Mossland 语音代理服务异常。";
        return json({ error: message }, status);
      }
    }

    if (url.pathname === "/api/image/models") {
      try {
        return json({ success: true, models: await fetchImageModels(body as any) });
      } catch (error) {
        return errorResponse(error, "model-list", "无法访问图片模型列表。");
      }
    }

    if (url.pathname === "/api/image/test") {
      try {
        const result = await testImageConnectionWithProtocol({ ...body, model: body.selectedModel } as any);
        return json({ success: result.success, kind: result.kind, message: result.message });
      } catch (error) {
        return errorResponse(error, "test", "图片 API 测试失败。");
      }
    }

    if (url.pathname === "/api/image/generate") {
      try {
        assertImageGenerationTrigger(body.trigger as "manual" | "explicit-user-text", typeof body.userText === "string" ? body.userText : undefined);
        return json({ dataUrl: await generateImageWithProtocol(body as any) });
      } catch (error) {
        const imageError = error instanceof ImageApiError ? error : null;
        const status = imageError?.status || (error instanceof Error && error.message.includes("图片生成已拦截") ? 403 : 400);
        const message = error instanceof Error && error.message ? error.message : "图片代理服务异常。";
        return json({ code: imageError?.code || "generation", error: message }, status);
      }
    }

    return json({ success: false, error: "未知图片代理路径。" }, 404);
  },
};
