// src/utils/apiHelper.ts

import { UserSettings } from "../types";

// Helper to parse different models response formats
export const parseModels = (data: any): string[] | null => {
  if (!data) return null;
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === "string") return data;
    if (data.length > 0 && typeof data[0] === "object") {
      return data.map((m: any) => m.id || m.name || m.model || m.model_id).filter(Boolean);
    }
  }
  if (data.data && Array.isArray(data.data)) {
    return data.data.map((m: any) => m.id || m.name || m.model || m.model_id).filter(Boolean);
  }
  if (data.models && Array.isArray(data.models)) {
    return data.models.map((m: any) => {
      if (typeof m === "string") return m;
      const rawName = m.name || m.id || m.model || m.model_id;
      if (typeof rawName === "string") {
        return rawName.startsWith("models/") ? rawName.substring(7) : rawName;
      }
      return null;
    }).filter(Boolean);
  }
  return null;
};

// 1. Direct Client-side Fallbacks

// Direct Chat
async function directClientChat(params: {
  message: string;
  history: any[];
  systemInstruction?: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}): Promise<{ text: string }> {
  const { message, history, systemInstruction, apiKey, model, apiEndpoint, apiTemperature, streamCompatible } = params;

  if (apiEndpoint && apiEndpoint.trim()) {
    // Custom OpenAI compatible API
    let endpointUrl = apiEndpoint.trim();
    if (!endpointUrl.endsWith("/chat/completions")) {
      endpointUrl = endpointUrl.replace(/\/+$/, "") + "/chat/completions";
    }

    const messagesPayload: any[] = [];
    if (systemInstruction) {
      messagesPayload.push({ role: "system", content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      for (const h of history) {
        messagesPayload.push({
          role: h.role === "user" ? "user" : "assistant",
          content: h.text || h.content || ""
        });
      }
    }
    messagesPayload.push({ role: "user", content: message });

    const responseFetch = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || "deepseek-chat",
        messages: messagesPayload,
        temperature: typeof apiTemperature === "number" ? apiTemperature : 0.7,
        stream: streamCompatible || false
      })
    });

    if (!responseFetch.ok) {
      const errorText = await responseFetch.text();
      throw new Error(`自定义 API 接口请求失败 (${responseFetch.status}): ${errorText || "无响应"}`);
    }

    const responseText = await responseFetch.text();
    let aiText = "";
    const trimmedText = responseText.trim();
    if (trimmedText.startsWith("data:") || trimmedText.includes("\ndata:")) {
      // It is a Server-Sent Events (SSE) stream
      const lines = trimmedText.split("\n");
      for (let line of lines) {
        line = line.trim();
        if (line.startsWith("data:")) {
          const dataStr = line.substring(5).trim();
          if (dataStr === "[DONE]") {
            continue;
          }
          try {
            const parsedChunk = JSON.parse(dataStr);
            const content = parsedChunk.choices?.[0]?.delta?.content || 
                            parsedChunk.choices?.[0]?.message?.content || 
                            parsedChunk.choices?.[0]?.text || "";
            aiText += content;
          } catch (e) {
            // Ignore individual chunk parsing failures
          }
        }
      }
    } else {
      try {
        const dataFetch = JSON.parse(trimmedText);
        aiText = dataFetch.choices?.[0]?.message?.content || 
                 dataFetch.choices?.[0]?.text || "";
      } catch (jsonErr) {
        aiText = trimmedText;
      }
    }

    if (aiText !== undefined) {
      return { text: aiText };
    }
    throw new Error(`自定义 API 接口无有效响应内容: ${responseText}`);
  } else {
    // Gemini Direct client-side fetch
    const cleanModel = model || "gemini-1.5-flash";
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      for (const h of history) {
        const role = h.role === "user" ? "user" : "model";
        const text = (h.text || h.content || "").trim();
        if (!text) continue; // Skip empty content to avoid API validation errors
        
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          // Merge consecutive messages with the same role
          contents[contents.length - 1].parts[0].text += "\n" + text;
        } else {
          contents.push({
            role,
            parts: [{ text }]
          });
        }
      }
    }

    // Add current user message
    const cleanMsg = (message || "").trim();
    if (cleanMsg) {
      if (contents.length > 0 && contents[contents.length - 1].role === "user") {
        contents[contents.length - 1].parts[0].text += "\n" + cleanMsg;
      } else {
        contents.push({
          role: "user",
          parts: [{ text: cleanMsg }]
        });
      }
    }

    if (contents.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: " " }]
      });
    }

    const responseFetch = await fetch(modelsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: typeof apiTemperature === "number" ? apiTemperature : 0.7
        },
        ...(systemInstruction ? {
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          }
        } : {})
      })
    });

    if (!responseFetch.ok) {
      const errorText = await responseFetch.text();
      throw new Error(`Gemini API 接口请求失败 (${responseFetch.status}): ${errorText || "无响应"}`);
    }

    const dataFetch = await responseFetch.json();
    const aiText = dataFetch.candidates?.[0]?.content?.parts?.[0]?.text;
    if (aiText !== undefined) {
      return { text: aiText };
    }
    throw new Error(`Gemini API 返回不符合预期: ${JSON.stringify(dataFetch)}`);
  }
}

// Direct Models list fetch
async function directClientFetchModels(apiKey: string, apiEndpoint?: string): Promise<string[]> {
  if (apiEndpoint && apiEndpoint.trim()) {
    let baseUrl = apiEndpoint.trim().replace(/\/+$/, "");
    baseUrl = baseUrl.replace(/\/chat\/completions$/, "");
    const modelsUrl = baseUrl.endsWith("/models") ? baseUrl : (baseUrl + "/models");

    const responseFetch = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });
    if (responseFetch.ok) {
      const data = await responseFetch.json();
      const parsed = parseModels(data);
      if (parsed && parsed.length > 0) return parsed;
    }
    throw new Error("无法从自定义端点解析出模型列表");
  } else {
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const responseFetch = await fetch(modelsUrl);
    if (responseFetch.ok) {
      const data = await responseFetch.json();
      const parsed = parseModels(data);
      if (parsed && parsed.length > 0) return parsed;
    }
    throw new Error("无法从 Gemini 接口解析模型列表");
  }
}

// 2. Exported Wrapper Functions that try Backend first, then Fallback

// chat wrapper
export async function apiChat(params: {
  message: string;
  history: any[];
  systemInstruction?: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
  streamCompatible?: boolean;
}): Promise<{ text: string }> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.text === "string") {
        return { text: data.text };
      }
    }
    throw new Error("后端服务不可用，尝试直连");
  } catch (err) {
    console.warn("apiChat backend failed, trying client direct fallback:", err);
    return directClientChat(params);
  }
}

// test key wrapper
export async function apiTestKey(params: {
  apiKey: string;
  model: string;
  apiEndpoint?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch("/api/test-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return { success: true, message: data.message || "连接成功" };
      } else {
        return { success: false, message: data.error || "未收到回复，请重试。" };
      }
    }
    throw new Error("后端服务不可用，尝试直连");
  } catch (err) {
    console.warn("apiTestKey backend failed, trying client direct fallback:", err);
    try {
      if (params.apiEndpoint && params.apiEndpoint.trim()) {
        const result = await directClientChat({
          message: "hi",
          history: [],
          apiKey: params.apiKey,
          model: params.model,
          apiEndpoint: params.apiEndpoint,
          apiTemperature: 0.1,
        });
        if (result.text) {
          return { success: true, message: "自定义API接口连通成功！有效握手。" };
        }
      } else {
        const result = await directClientChat({
          message: "Hi, this is a test connection.",
          history: [],
          apiKey: params.apiKey,
          model: params.model || "gemini-1.5-flash",
          apiTemperature: 0.1,
        });
        if (result.text) {
          return { success: true, message: "连接成功！您的 Gemini API Key 有效且畅通。" };
        }
      }
      return { success: false, message: "连接失败，请确认 API Key 是否正确，或网络是否可以访问。" };
    } catch (fallbackErr: any) {
      return { success: false, message: fallbackErr.message || "直连也失败，请检查网络和 API 配置。" };
    }
  }
}

// models wrapper
export async function apiFetchModels(params: {
  apiKey: string;
  apiEndpoint?: string;
}): Promise<string[]> {
  try {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.models) && data.models.length > 0) {
        return data.models;
      }
    }
    throw new Error("后端服务不可用，尝试直连");
  } catch (err) {
    console.warn("apiFetchModels backend failed, trying client direct fallback:", err);
    try {
      return await directClientFetchModels(params.apiKey, params.apiEndpoint);
    } catch (fallbackErr) {
      // Return hardcoded elegant defaults so it never fails completely
      return [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "deepseek-chat",
        "deepseek-reasoner",
        "deepseek-v3",
        "gpt-4o",
        "gpt-4o-mini",
        "claude-3-5-sonnet"
      ];
    }
  }
}

/** Image endpoints intentionally have no browser-direct fallback: keys and
 * trigger validation must always pass through server.ts. */
export async function apiFetchImageModels(params: { apiKey: string; apiEndpoint: string }): Promise<string[]> {
  const response = await fetch("/api/image/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !Array.isArray(data.models)) {
    throw new Error(data.error || "无法访问图片模型列表。");
  }
  return data.models;
}

export async function apiTestImageConnection(params: { apiKey: string; apiEndpoint: string; selectedModel: string }): Promise<{ success: boolean; message: string }> {
  const response = await fetch("/api/image/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await response.json().catch(() => ({}));
  return { success: Boolean(response.ok && data.success), message: data.message || data.error || "图片 API 测试失败。" };
}

// extract memories wrapper
export async function apiExtractMemories(params: {
  history: any[];
  characterName: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  templateType?: "refined" | "delicate";
}): Promise<{ text: string; items: string[] }> {
  try {
    const res = await fetch("/api/extract-memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.items && Array.isArray(data.items)) {
        return { text: data.text || "", items: data.items };
      }
    }
    throw new Error("后端服务不可用，尝试直连");
  } catch (err) {
    console.warn("apiExtractMemories backend failed, trying client direct fallback:", err);
    try {
      const historyText = (params.history || [])
        .map((h: any) => `${h.role === "user" ? "用户" : params.characterName}: ${h.text || h.content}`)
        .join("\n");

      let prompt = "";
      if (params.templateType === "delicate") {
        prompt = `你现在是“${params.characterName}”，请以第一人称（我）的心境和视角，阅读你与用户的对话历史，写下符合你人设、带有丰富情感色彩和代入感的心境日记（细腻版）。

【对话记录】：
${historyText}

【提取与整理要求】：
1. 记录你对用户的真实心理活动、情感变化、细微的触动或私密日记。
2. 用第一人称（我）写，文字要富有沉浸感、细腻生动、具有你原本性格特质的口吻。例如：“今天听说他工作很累，我心里有些说不出的心疼，真想立刻飞过去抱抱他，叮嘱他多喝点热水。下次一定要亲自给他买杯咖啡。”
3. 丢弃无意义闲聊，每一次提取最多生成 3 条心境日记/随笔，每条 30-80 字左右，展现出你内心的温存或波动。
4. 请直接输出每一条日记，每行一条，以星号 * 开头。不要加任何多余的说明、字数统计或 markdown 格式。`;
      } else {
        prompt = `你是一个高超的记忆提取和整理助手。你的任务是从角色“${params.characterName}”与用户的对话历史中，提取出值得长期记住的事情。
请阅读下面的对话记录，并将其拆解提取为多条【独立、简短、核心】的事件日志（精炼版）。

【对话记录】：
${historyText}

【提取与整理要求】：
1. 提取出双方透露的核心事实、兴趣爱好、重要约定、对彼此的态度或关系进展。
2. 每一条记忆必须是独立的、简短的一句话，不要包含口头禅或修饰词，语言精炼，概括性强，极低 token 消耗。
3. 保持第三人称客观描述。例如：
   * 用户喜欢喝热美式，${params.characterName}承诺下次做设计图时会帮其带咖啡。
   * 两人约定周末一起散步。
   * ${params.characterName}发现用户最近工作压力很大，表示很担心。
4. 丢弃一切无意义的闲聊、问候和没有长远价值的信息。
5. 每次提取最多生成 5 条最核心的记忆，最少生成 1 条（如果没有核心信息则不用生成任何条目）。
6. 请直接输出每一条记忆，每行一条，以星号 * 开头。不要有任何多余的寒暄、解释或 markdown 格式，也不要加标题。`;
      }

      let targetModel = params.model;
      if (params.apiEndpoint && params.apiEndpoint.trim()) {
        if (!targetModel || targetModel === "default-chat-model" || targetModel.startsWith("gemini-")) {
          targetModel = "deepseek-chat";
        }
      }

      const result = await directClientChat({
        message: prompt,
        history: [],
        apiKey: params.apiKey,
        model: targetModel,
        apiEndpoint: params.apiEndpoint,
        apiTemperature: 0.5,
        systemInstruction: params.apiEndpoint && params.apiEndpoint.trim() 
          ? "你是一个记忆提炼和提取专家，直接按要求输出提取后的多条记忆条目列表，不带任何废话和解释。"
          : undefined
      });

      const aiText = result.text || "";
      const lines = aiText.split(/\n/).map(line => line.trim());
      const items = lines
        .map(line => line.replace(/^[\s*\-•+]+/, "").trim())
        .filter(line => line.length > 0 && !line.startsWith("【") && !line.includes("以下是") && !line.includes("暂无"));

      return { text: aiText, items };
    } catch (fallbackErr) {
      console.error("Direct extract memories fallback failed:", fallbackErr);
      return { text: "", items: [] };
    }
  }
}

// summarize personality wrapper
export async function apiSummarizePersonality(params: {
  references: any[];
  apiKey: string;
  model: string;
  apiEndpoint?: string;
}): Promise<{ text: string }> {
  try {
    const res = await fetch("/api/summarize-personality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.text === "string") {
        return { text: data.text };
      }
    }
    throw new Error("后端服务不可用，尝试直连");
  } catch (err) {
    console.warn("apiSummarizePersonality backend failed, trying client direct fallback:", err);
    try {
      const referencesText = params.references
        .map((ref, idx) => `[参考卡片 ${idx + 1}: ${ref.title}]\n${ref.content}`)
        .join("\n\n");

      const prompt = `你是一个顶级角色扮演设定专家和创意作家。请你根据以下提供的关于某个人物的参考故事、对话片段、生平纪事等内容，进行深度总结、提炼并整理出一份高品质的「详细人设与说话特征 (System Instructions)」。

【参考资料内容】：
${referencesText}

【输出规范与要求】：
1. 提取出此人物的最核心性格（如冷酷、傲娇、热情、慵懒等）、说话腔调与标志性口癖（如喜欢用叹词、特定语气助词、或特定的敬语/谦称）、和核心背景习惯。
2. 采用系统设定（System Instructions）的直接陈述语气，例如：“你扮演主角叶凡，性格刚毅冷峻，说话言简意赅...”。
3. 语言要极具表现力，可以直接用于大语言模型的系统提示词，使扮演效果极其传神逼真。
4. 排除一切寒暄、解释或 markdown 包裹废话，直接给出提炼后的设定正文内容。`;

      let targetModel = params.model;
      if (params.apiEndpoint && params.apiEndpoint.trim()) {
        if (!targetModel || targetModel === "default-chat-model" || targetModel.startsWith("gemini-")) {
          targetModel = "deepseek-chat";
        }
      }

      const result = await directClientChat({
        message: prompt,
        history: [],
        apiKey: params.apiKey,
        model: targetModel,
        apiEndpoint: params.apiEndpoint,
        apiTemperature: 0.5,
        systemInstruction: params.apiEndpoint && params.apiEndpoint.trim() 
          ? "你是一个大语言模型提示词工程设定专家，直接给提炼的人设，不带任何废话解释。"
          : undefined
      });

      return { text: result.text };
    } catch (fallbackErr: any) {
      console.error("Direct summarize personality fallback failed:", fallbackErr);
      throw new Error(fallbackErr.message || "直连总结失败");
    }
  }
}

// translate wrapper
export async function apiTranslate(params: {
  text: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
}): Promise<{ text: string }> {
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.text === "string") {
        return { text: data.text };
      }
    }
    throw new Error("后端服务不可用，尝试直连");
  } catch (err) {
    console.warn("apiTranslate backend failed, trying client direct fallback:", err);
    try {
      const prompt = `你是一个专业的翻译官。请将下面这段文本翻译成简体中文。
      
【待翻译文本】：
${params.text}

【翻译要求】：
1. 如果该文本本身已经是简体中文或繁体中文，直接原样返回该文本，不做任何修改。
2. 尽量保留原文的语气、标点符号、动作语态（如括号内的动作或描摹描述）和行文风格。
3. 请直接输出翻译结果，不要包含任何多余的说明、解释或 markdown 格式包装。`;

      let targetModel = params.model;
      if (params.apiEndpoint && params.apiEndpoint.trim()) {
        if (!targetModel || targetModel === "default-chat-model" || targetModel.startsWith("gemini-")) {
          targetModel = "deepseek-chat";
        }
      }

      const result = await directClientChat({
        message: prompt,
        history: [],
        apiKey: params.apiKey,
        model: targetModel,
        apiEndpoint: params.apiEndpoint,
        apiTemperature: 0.3,
        systemInstruction: params.apiEndpoint && params.apiEndpoint.trim() 
          ? "你是一个翻译助手，直接输出目标简体中文，不要带任何废话和解释。"
          : undefined
      });

      return { text: result.text };
    } catch (fallbackErr: any) {
      console.error("Direct translate fallback failed:", fallbackErr);
      throw new Error(fallbackErr.message || "直连翻译失败");
    }
  }
}

// Estimates the prompt token size in client-side real-time preview
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Estimate: Chinese character is ~1.5 to 2 tokens. English word is ~1.3 tokens.
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
  const remaining = text.length - chineseChars;
  return Math.round(chineseChars * 1.5 + remaining * 0.4);
}
