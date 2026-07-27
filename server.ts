import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { fetchImageModels, generateImageWithProtocol } from "./src/server/imageProtocolAdapters";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON parsing with size limits for custom base64 wallpapers or customized avatars
  app.use(express.json({ limit: "15mb" }));

  const explicitImageRequest = (text: string) => {
    const image = "(?:照片|图片|图像|相片|自拍(?:照)?)";
    const request = new RegExp(`(?:给我|给咱|发我|来|拍|生成).{0,18}${image}|(?:发|拍|生成).{0,10}${image}.{0,12}(?:给我|给咱|发我|看看)|${image}.{0,12}(?:给我|给咱|发我|看看|来一张|生成)`, "i");
    const blocked = new RegExp(`(?:不要|别|无需|不用|禁止|不想|别再|没让你|我没让你|并非|不是).{0,18}(?:发|拍|生成)?.{0,12}${image}|(?:“|"|《).{0,40}(?:发.{0,8}${image}|生成.{0,8}${image})`, "i");
    return Boolean(text?.trim()) && !blocked.test(text) && request.test(text);
  };
  // Image settings dispatch by the selected protocol. These endpoints never
  // fall back to text chat and the test endpoint never creates an image.
  app.post("/api/image/models", async (req, res) => {
    try {
      return res.json({ success: true, models: await fetchImageModels(req.body) });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || "无法访问图片模型列表。" });
    }
  });

  app.post("/api/image/test", async (req, res) => {
    try {
      const models = await fetchImageModels(req.body);
      const selected = String(req.body.selectedModel || "").trim();
      return res.json({ success: true, message: selected && !models.includes(selected)
        ? "模型列表可访问，但所选模型不在列表中；这不会测试或消耗图片生成额度。"
        : "代理与模型列表可访问；这不会测试图片生成，模型列表成功不等于模型支持图片或参考图。" });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || "图片 API 测试失败。" });
    }
  });

  app.post("/api/image/generate", async (req, res) => {
    try {
      const { trigger, userText } = req.body || {};
      if (trigger !== "manual" && !(trigger === "explicit-user-text" && explicitImageRequest(String(userText || "")))) {
        return res.status(403).json({ error: "图片生成已拦截：触发来源不是手动确认或明确的用户图片请求。" });
      }
      return res.json({ dataUrl: await generateImageWithProtocol(req.body) });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || "图片代理服务异常。" });
    }
  });

  // API Route: Role-play chat with Character (supports custom Endpoint, Temperature, etc.)
  app.post("/api/chat", async (req, res) => {
    try {
      const {
        message,
        history,
        systemInstruction,
        apiKey,
        model,
        apiEndpoint,
        apiTemperature,
        streamCompatible
      } = req.body;

      const apiKeyValue = apiKey || process.env.GEMINI_API_KEY;
      if (!apiKeyValue) {
        return res.status(400).json({
          error: "未检测到 API Key。请在手机“设置” -> “API设置”中填写您的 API Key，或由管理员配置后台默认 Key。",
        });
      }

      // 1. Custom OpenAI-compatible endpoint route
      if (apiEndpoint && apiEndpoint.trim()) {
        let endpointUrl = apiEndpoint.trim();
        if (!endpointUrl.endsWith("/chat/completions")) {
          endpointUrl = endpointUrl.replace(/\/+$/, "") + "/chat/completions";
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKeyValue}`
        };

        const messagesPayload = [];
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

        const bodyPayload = {
          model: model || "deepseek-v4-flash",
          messages: messagesPayload,
          temperature: typeof apiTemperature === "number" ? apiTemperature : 0.7,
          stream: streamCompatible || false
        };

        const responseFetch = await fetch(endpointUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyPayload)
        });

        if (!responseFetch.ok) {
          const errorText = await responseFetch.text();
          return res.status(responseFetch.status).json({
            error: `自定义接口请求失败 (${responseFetch.status}): ${errorText || "中转服务器未响应"}`
          });
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
        return res.json({ text: aiText });
      }

      // 2. Default Gemini endpoint route via @google/genai
      const ai = new GoogleGenAI({
        apiKey: apiKeyValue,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // Format message history for Gemini:
      const contents = [];
      if (history && Array.isArray(history)) {
        for (const h of history) {
          const role = h.role === "user" ? "user" : "model";
          const text = (h.text || h.content || "").trim();
          if (!text) continue; // Skip empty content to prevent API validation errors
          
          if (contents.length > 0 && contents[contents.length - 1].role === role) {
            // Merge consecutive messages with the same role
            contents[contents.length - 1].parts[0].text += "\n" + text;
          } else {
            contents.push({
              role,
              parts: [{ text }],
            });
          }
        }
      }

      // Add current message
      const cleanMsg = (message || "").trim();
      if (cleanMsg) {
        if (contents.length > 0 && contents[contents.length - 1].role === "user") {
          contents[contents.length - 1].parts[0].text += "\n" + cleanMsg;
        } else {
          contents.push({
            role: "user",
            parts: [{ text: cleanMsg }],
          });
        }
      }

      if (contents.length === 0) {
        contents.push({
          role: "user",
          parts: [{ text: " " }],
        });
      }

      const response = await ai.models.generateContent({
        model: model || "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: typeof apiTemperature === "number" ? apiTemperature : 0.7,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: error.message || "角色智能体离线或回复出错，请检查配置和 Key 后重试。" });
    }
  });

  // API Route: Summarize Character Personality from References
  app.post("/api/summarize-personality", async (req, res) => {
    try {
      const { references, apiKey, model, apiEndpoint } = req.body;
      const apiKeyValue = apiKey || process.env.GEMINI_API_KEY;
      if (!apiKeyValue) {
        return res.status(400).json({
          error: "未检测到 API Key。请在手机“设置” -> “API设置”中填写您的 API Key，或由管理员配置后台默认 Key。",
        });
      }

      if (!references || !Array.isArray(references) || references.length === 0) {
        return res.status(400).json({ error: "请至少添加一个参考内容卡片后再进行 AI 总结！" });
      }

      const referencesText = references
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

      // 1. Custom endpoint
      if (apiEndpoint && apiEndpoint.trim()) {
        let endpointUrl = apiEndpoint.trim();
        if (!endpointUrl.endsWith("/chat/completions")) {
          endpointUrl = endpointUrl.replace(/\/+$/, "") + "/chat/completions";
        }

        let targetModel = model;
        if (!targetModel || targetModel === "default-chat-model" || targetModel.startsWith("gemini-")) {
          targetModel = "deepseek-v4-flash";
        }

        const responseFetch = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKeyValue}`
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: "你是一个角色人设总结助手，请直接输出设定，不需要废话。" },
              { role: "user", content: prompt }
            ],
            temperature: 0.6
          })
        });

        if (!responseFetch.ok) {
          const errorText = await responseFetch.text();
          return res.status(responseFetch.status).json({
            error: `中转接口总结失败 (${responseFetch.status}): ${errorText || "服务器未响应"}`
          });
        }

        const dataFetch = await responseFetch.json();
        const aiText = dataFetch.choices?.[0]?.message?.content || "";
        return res.json({ text: aiText });
      }

      // 2. Default Gemini API
      const ai = new GoogleGenAI({
        apiKey: apiKeyValue,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const response = await ai.models.generateContent({
        model: model || "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: 0.6,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Summarize Personality Error:", error);
      res.status(500).json({ error: error.message || "AI 总结发生异常，请检查配置或稍后再试。" });
    }
  });

  // API Route: Compress dialogue memory
  app.post("/api/compress-memory", async (req, res) => {
    try {
      const { history, currentMemory, characterName, apiKey, model, apiEndpoint } = req.body;
      const apiKeyValue = apiKey || process.env.GEMINI_API_KEY;
      if (!apiKeyValue) {
        return res.status(400).json({
          error: "未检测到 API Key。请在手机“设置” -> “API设置”中填写您的 API Key，或由管理员配置后台默认 Key。",
        });
      }

      const historyText = (history || [])
        .map((h: any) => `${h.role === "user" ? "用户" : characterName}: ${h.text || h.content}`)
        .join("\n");

      const prompt = `你是一个高超的记忆整理和压缩助手。当前你正在为角色“${characterName}”整理与用户的对话历史。
请阅读下面的对话记录，并将其提炼合并到已有的【记忆储备】中，融合成一段新的记忆（如果没有已有的，就直接将这些对话提炼）。

【已有的记忆储备】：
${currentMemory || "暂无已有记忆。"}

【新增的对话记录】：
${historyText}

【提炼与压缩要求】：
1. 提取出双方在对话中透露的关键事实、兴趣爱好、对彼此的看法、约定事项、或是情感关系进展。
2. 语言要精炼，概括性强，保持客观描述（例如：“用户喜欢喝热美式，${characterName}承诺下次做设计图时会帮其带咖啡。两人约定周末一起散步。”）。
3. 丢弃一切闲聊和无意义的寒暄，只保留对后续对话和人设有关联的核心记忆点。
4. 字数控制在350字以内。
5. 排除一切寒暄、解释或 markdown 废话，直接给出整理合并后的全新记忆设定正文。`;

      // 1. Custom endpoint
      if (apiEndpoint && apiEndpoint.trim()) {
        let endpointUrl = apiEndpoint.trim();
        if (!endpointUrl.endsWith("/chat/completions")) {
          endpointUrl = endpointUrl.replace(/\/+$/, "") + "/chat/completions";
        }

        let targetModel = model;
        if (!targetModel || targetModel === "default-chat-model" || targetModel.startsWith("gemini-")) {
          targetModel = "deepseek-v4-flash";
        }

        const responseFetch = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKeyValue}`
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: "你是一个记忆提炼和压缩专家，直接输出提炼后的全新记忆设定正文，不带任何废话。" },
              { role: "user", content: prompt }
            ],
            temperature: 0.5
          })
        });

        if (!responseFetch.ok) {
          const errorText = await responseFetch.text();
          return res.status(responseFetch.status).json({
            error: `中转接口压缩失败 (${responseFetch.status}): ${errorText || "服务器未响应"}`
          });
        }

        const dataFetch = await responseFetch.json();
        const aiText = dataFetch.choices?.[0]?.message?.content || "";
        return res.json({ text: aiText });
      }

      // 2. Default Gemini API
      const ai = new GoogleGenAI({
        apiKey: apiKeyValue,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const response = await ai.models.generateContent({
        model: model || "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: 0.5,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Compress Memory Error:", error);
      res.status(500).json({ error: error.message || "记忆压缩发生异常，请稍后再试。" });
    }
  });

  // API Route: Extract individual memories
  app.post("/api/extract-memories", async (req, res) => {
    try {
      const { history, characterName, apiKey, model, apiEndpoint } = req.body;
      const apiKeyValue = apiKey || process.env.GEMINI_API_KEY;
      if (!apiKeyValue) {
        return res.status(400).json({
          error: "未检测到 API Key。请在手机“设置” -> “API设置”中填写您的 API Key，或由管理员配置后台默认 Key。",
        });
      }

      const historyText = (history || [])
        .map((h: any) => `${h.role === "user" ? "用户" : characterName}: ${h.text || h.content}`)
        .join("\n");

      const prompt = `你是一个高超的记忆提取和整理助手。你的任务是从角色“${characterName}”与用户的对话历史中，提取出值得长期记住的事情。
请阅读下面的对话记录，并将其拆解提取为多条【独立、简短、核心】的记忆条目。

【对话记录】：
${historyText}

【提取与整理要求】：
1. 提取出双方透露的核心事实、兴趣爱好、重要约定、对彼此的态度或关系进展。
2. 每一条记忆必须是独立的、简短的一句话，不要包含口头禅或修饰词，语言精炼，概括性强。
3. 保持第三人称客观描述。例如：
   * 用户喜欢喝热美式，${characterName}承诺下次做设计图时会帮其带咖啡。
   * 两人约定周末一起散步。
   * ${characterName}发现用户最近工作压力很大，表示很担心。
4. 丢弃一切无意义的闲聊、问候和没有长远价值的信息。
5. 每次提取最多生成 5 条最核心的记忆，最少生成 1 条（如果没有核心信息则不用生成任何条目）。
6. 请直接输出每一条记忆，每行一条，以星号 * 开头。不要有任何多余的寒暄、解释或 markdown 格式，也不要加标题。`;

      let aiText = "";

      // 1. Custom endpoint
      if (apiEndpoint && apiEndpoint.trim()) {
        let endpointUrl = apiEndpoint.trim();
        if (!endpointUrl.endsWith("/chat/completions")) {
          endpointUrl = endpointUrl.replace(/\/+$/, "") + "/chat/completions";
        }

        let targetModel = model;
        if (!targetModel || targetModel === "default-chat-model" || targetModel.startsWith("gemini-")) {
          targetModel = "deepseek-v4-flash";
        }

        const responseFetch = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKeyValue}`
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: "你是一个记忆提炼和提取专家，直接按要求输出提取后的多条记忆条目列表，不带任何废话和解释。" },
              { role: "user", content: prompt }
            ],
            temperature: 0.5
          })
        });

        if (!responseFetch.ok) {
          const errorText = await responseFetch.text();
          return res.status(responseFetch.status).json({
            error: `中转接口提取失败 (${responseFetch.status}): ${errorText || "服务器未响应"}`
          });
        }

        const dataFetch = await responseFetch.json();
        aiText = dataFetch.choices?.[0]?.message?.content || "";
      } else {
        // 2. Default Gemini API
        const ai = new GoogleGenAI({
          apiKey: apiKeyValue,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const response = await ai.models.generateContent({
          model: model || "gemini-3.5-flash",
          contents: prompt,
          config: {
            temperature: 0.5,
          },
        });

        aiText = response.text || "";
      }

      // Parse bullet points
      const lines = aiText.split(/\n/).map(line => line.trim());
      const items = lines
        .map(line => line.replace(/^[\s*\-•+]+/, "").trim())
        .filter(line => line.length > 0 && !line.startsWith("【") && !line.includes("以下是") && !line.includes("暂无"));

      res.json({ text: aiText, items });
    } catch (error: any) {
      console.error("Extract Memories Error:", error);
      res.status(500).json({ error: error.message || "提取记忆发生异常，请稍后再试。" });
    }
  });

  // API Route: Translate text to Chinese (if non-Chinese)
  app.post("/api/translate", async (req, res) => {
    try {
      const { text, apiKey, model, apiEndpoint } = req.body;
      const apiKeyValue = apiKey || process.env.GEMINI_API_KEY;
      if (!apiKeyValue) {
        return res.status(400).json({
          error: "未检测到 API Key。请在手机“设置” -> “API设置”中填写您的 API Key，或由管理员配置后台默认 Key。",
        });
      }

      const prompt = `你是一个专业的翻译官。请将下面这段文本翻译成简体中文。
      
【待翻译文本】：
${text}

【翻译要求】：
1. 如果该文本本身已经是简体中文或繁体中文，直接原样返回该文本，不做任何修改。
2. 尽量保留原文的语气、标点符号、动作语态（如括号内的动作或描摹描述）和行文风格。
3. 请直接输出翻译结果，不要包含任何多余的说明、解释或 markdown 格式包装。`;

      // 1. Custom endpoint
      if (apiEndpoint && apiEndpoint.trim()) {
        let endpointUrl = apiEndpoint.trim();
        if (!endpointUrl.endsWith("/chat/completions")) {
          endpointUrl = endpointUrl.replace(/\/+$/, "") + "/chat/completions";
        }

        let targetModel = model;
        if (!targetModel || targetModel === "default-chat-model" || targetModel.startsWith("gemini-")) {
          targetModel = "deepseek-v4-flash";
        }

        const responseFetch = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKeyValue}`
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: "你是一个翻译助手，直接输出目标简体中文，不要带任何废话和解释。" },
              { role: "user", content: prompt }
            ],
            temperature: 0.3
          })
        });

        if (!responseFetch.ok) {
          const errorText = await responseFetch.text();
          return res.status(responseFetch.status).json({
            error: `中转接口翻译失败 (${responseFetch.status}): ${errorText || "服务器未响应"}`
          });
        }

        const dataFetch = await responseFetch.json();
        const aiText = dataFetch.choices?.[0]?.message?.content || "";
        return res.json({ text: aiText });
      }

      // 2. Default Gemini API
      const ai = new GoogleGenAI({
        apiKey: apiKeyValue,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const response = await ai.models.generateContent({
        model: model || "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: 0.3,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Translate Error:", error);
      res.status(500).json({ error: error.message || "翻译发生异常，请检查配置或稍后再试。" });
    }
  });

  // API Route: Test API connection and Key validity
  app.post("/api/test-key", async (req, res) => {
    try {
      const { apiKey, model, apiEndpoint } = req.body;
      const apiKeyValue = apiKey || process.env.GEMINI_API_KEY;
      if (!apiKeyValue) {
        return res.status(400).json({ error: "请输入 API Key" });
      }

      // 1. Test custom OpenAI-compatible endpoint
      if (apiEndpoint && apiEndpoint.trim()) {
        let endpointUrl = apiEndpoint.trim();
        if (!endpointUrl.endsWith("/chat/completions")) {
          endpointUrl = endpointUrl.replace(/\/+$/, "") + "/chat/completions";
        }

        const responseFetch = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKeyValue}`
          },
          body: JSON.stringify({
            model: model || "deepseek-v4-flash",
            messages: [{ role: "user", content: "hi" }],
            temperature: 0.1,
            max_tokens: 5
          })
        });

        if (responseFetch.ok) {
          const dataFetch = await responseFetch.json();
          const message = dataFetch.choices?.[0]?.message;
          if (message) {
            return res.json({ success: true, message: "自定义API接口连通成功！有效握手。" });
          } else {
            return res.json({ success: false, error: `自定义API接口握手成功，但返回的响应格式不符合标准 OpenAI 规范。完整响应：${JSON.stringify(dataFetch)}` });
          }
        } else {
          const errorText = await responseFetch.text();
          return res.json({ success: false, error: `接口握手失败 (${responseFetch.status}): ${errorText || "返回空响应"}` });
        }
      }

      // 2. Default Gemini test
      const ai = new GoogleGenAI({
        apiKey: apiKeyValue,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const response = await ai.models.generateContent({
        model: model || "gemini-3.5-flash",
        contents: "Hi, this is a test connection.",
      });

      if (response && response.text) {
        res.json({ success: true, message: "连接成功！您的 Gemini API Key 有效且畅通。" });
      } else {
        res.json({ success: false, error: "未收到回复，请重试。" });
      }
    } catch (error: any) {
      console.error("Test Key API Error:", error);
      res.json({ success: false, error: error.message || "连接失败，请确认 API Key 是否正确，或网络是否可以访问。" });
    }
  });

  // API Route: Dynamically fetch models from custom endpoints
  app.post("/api/models", async (req, res) => {
    try {
      const { apiKey, apiEndpoint } = req.body;
      const apiKeyValue = apiKey || process.env.GEMINI_API_KEY;

      const parseModels = (data: any): string[] | null => {
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

      if (apiEndpoint && apiEndpoint.trim() && apiKeyValue) {
        let baseUrl = apiEndpoint.trim().replace(/\/+$/, "");
        baseUrl = baseUrl.replace(/\/chat\/completions$/, "");
        const modelsUrl = baseUrl.endsWith("/models") ? baseUrl : (baseUrl + "/models");

        const responseFetch = await fetch(modelsUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKeyValue}`
          }
        });
        if (responseFetch.ok) {
          const data = await responseFetch.json();
          const parsed = parseModels(data);
          if (parsed && parsed.length > 0) {
            return res.json({ success: true, models: parsed });
          }
        }
      } else if (apiKeyValue) {
        // Dynamically query Gemini models list if we have a key
        const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKeyValue}`;
        const responseFetch = await fetch(modelsUrl);
        if (responseFetch.ok) {
          const data = await responseFetch.json();
          const parsed = parseModels(data);
          if (parsed && parsed.length > 0) {
            return res.json({ success: true, models: parsed });
          }
        }
      }

      // Default models fallback
      res.json({
        success: true,
        models: [
          "gemini-2.5-flash",
          "gemini-2.5-pro",
          "gemini-1.5-flash",
          "gemini-1.5-pro",
          "deepseek-chat",
          "deepseek-reasoner",
          "deepseek-v3"
        ]
      });
    } catch (err: any) {
      res.json({
        success: true,
        models: [
          "gemini-2.5-flash",
          "gemini-2.5-pro",
          "gemini-1.5-flash",
          "gemini-1.5-pro",
          "deepseek-chat",
          "deepseek-reasoner",
          "deepseek-v3"
        ]
      });
    }
  });

  // API Route: MiniMax TTS Proxy to bypass CORS and hide API Key
  app.post("/api/minimax-tts", async (req, res) => {
    try {
      const {
        text,
        apiKey,
        groupId,
        model,
        voiceId,
        speed,
        pitch,
        vol,
      } = req.body;

      const finalApiKey = apiKey || process.env.MINIMAX_API_KEY;
      const finalGroupId = groupId || process.env.MINIMAX_GROUP_ID;

      if (!finalApiKey || !finalGroupId) {
        return res.status(400).json({
          error: "未配置 MiniMax API Key 或 Group ID。请在手机“设置” -> “MiniMax 语音”中进行配置，或由管理员配置后台环境变量。",
        });
      }

      const url = `https://api.minimax.chat/v1/t2a_v2?GroupId=${finalGroupId}`;
      const headers = {
        "Authorization": `Bearer ${finalApiKey}`,
        "Content-Type": "application/json",
      };

      const body = {
        model: model || "speech-2.8-hd",
        text,
        stream: false,
        voice_setting: {
          voice_id: voiceId || "female-shaonv",
          speed: speed !== undefined ? Number(speed) : 1.0,
          vol: vol !== undefined ? Number(vol) : 1.0,
          pitch: pitch !== undefined ? Number(pitch) : 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: "mp3",
        },
      };

      const responseFetch = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!responseFetch.ok) {
        const errText = await responseFetch.text();
        return res.status(responseFetch.status).json({
          error: `MiniMax API 接口返回错误 (${responseFetch.status}): ${errText}`,
        });
      }

      const data = await responseFetch.json();
      if (!data || !data.data || !data.data.audio) {
        const errMsg = data?.base_resp?.status_msg || "未收到有效的语音合成数据";
        return res.status(400).json({
          error: `MiniMax 合成失败: ${errMsg}`,
          raw: data,
        });
      }

      const audioHexOrBase64 = data.data.audio;
      let audioBuffer: Buffer;
      const isHex = /^[0-9a-fA-F]+$/.test(audioHexOrBase64);
      if (isHex) {
        audioBuffer = Buffer.from(audioHexOrBase64, "hex");
      } else {
        audioBuffer = Buffer.from(audioHexOrBase64, "base64");
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(audioBuffer);
    } catch (error: any) {
      console.error("MiniMax TTS Proxy Error:", error);
      return res.status(500).json({ error: error.message || "MiniMax 语音代理服务异常" });
    }
  });

  // Vite dev or production static file serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[小手机] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
