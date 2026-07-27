import { assertImageGenerationTrigger } from "../features/chat/services/imageGenerationIntent";
import { ImageApiError, fetchImageModels, generateImageWithProtocol, testImageConnectionWithProtocol } from "../server/imageProtocolAdapters";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
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

/**
 * Cloudflare deployment entry point. Only /api/image/* executes in the Worker;
 * all assets stay static and browser clients never contact image providers.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/image/")) return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ success: false, error: "图片代理只接受 POST 请求。" }, 405);

    const body = await requestBody(request);
    if (!body) return json({ success: false, error: "图片代理请求格式无效。" }, 400);

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
