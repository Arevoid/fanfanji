import { Character, WorldBookEntry } from "../types";

// PNG Character Card text chunk parser
export async function parsePngChunks(file: File): Promise<string | null> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  
  if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) {
    throw new Error("不是一个有效的 PNG 图片文件！");
  }
  
  let offset = 8;
  const length = buffer.byteLength;
  
  while (offset < length) {
    if (offset + 8 > length) break;
    const chunkLength = view.getUint32(offset);
    const chunkType = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );
    
    if (chunkType === "tEXt" || chunkType === "iTXt") {
      const chunkDataOffset = offset + 8;
      const chunkData = new Uint8Array(buffer, chunkDataOffset, chunkLength);
      const textDecoder = new TextDecoder("utf-8");
      const decoded = textDecoder.decode(chunkData);
      
      if (chunkType === "tEXt") {
        const parts = decoded.split("\0");
        if (parts.length >= 2) {
          const key = parts[0];
          const val = parts.slice(1).join("\0");
          if (key === "chara") {
            return val;
          }
        }
      } else if (chunkType === "iTXt") {
        const parts = decoded.split("\0");
        if (parts.length >= 2) {
          const key = parts[0];
          if (key === "chara") {
            let index = key.length + 3;
            while (index < decoded.length && decoded[index] !== "\0") {
              index++;
            }
            index++;
            while (index < decoded.length && decoded[index] !== "\0") {
              index++;
            }
            index++;
            const val = decoded.substring(index);
            return val;
          }
        }
      }
    }
    offset += 12 + chunkLength;
  }
  return null;
}

export function decodeCharaData(rawData: string): any {
  let text = rawData.trim();
  if (!text.startsWith("{")) {
    try {
      text = atob(text);
    } catch (e) {
      // ignore
    }
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("无法将解析出的数据转换为 JSON 格式: " + err);
  }
}

export const mapSillyTavernToCharacter = (json: any, defaultAvatar: string): Character => {
  const data = json.data || json;
  const charName = data.name || data.char_name || "未命名角色";
  
  let pDetails = "";
  if (data.personality) pDetails += `【性格】\n${data.personality}\n\n`;
  if (data.description || data.char_persona) pDetails += `【详细人设】\n${data.description || data.char_persona}\n\n`;
  if (data.scenario || data.world_scenario) pDetails += `【背景/情境】\n${data.scenario || data.world_scenario}\n\n`;
  if (data.mes_example) pDetails += `【对话范例】\n${data.mes_example}\n\n`;
  
  // Support Sully Character Card format or system prompt fields
  const sysPrompt = data.systemPrompt || data.system_prompt || json.systemPrompt || json.system_prompt;
  if (sysPrompt) {
    pDetails += `【系统提示/设定】\n${sysPrompt}\n\n`;
  }
  
  let bstory = data.creator_notes || data.creator || "";
  
  // Try mapping common fields
  let ageNum: number | "" = "";
  if (data.age !== undefined && data.age !== null && data.age !== "") {
    const parsedAge = parseInt(String(data.age));
    if (!isNaN(parsedAge)) {
      ageNum = parsedAge;
    }
  } else {
    const ageMatch = pDetails.match(/(?:年龄|Age|age|岁)[:：\s]*(\d+)/i);
    if (ageMatch) {
      ageNum = parseInt(ageMatch[1]);
    }
  }

  let genderStr = data.gender || "";
  if (!genderStr) {
    const genderMatch = pDetails.match(/(?:性别|Gender|gender)[:：\s]*([男女MaleFemale]+)/i);
    if (genderMatch) {
      genderStr = genderMatch[1].trim();
    }
  }
  
  // Heuristic for MBTI
  let mbtiStr = "";
  const mbtiCandidates = [
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP"
  ];
  for (const cand of mbtiCandidates) {
    if (pDetails.toUpperCase().includes(cand)) {
      mbtiStr = cand;
      break;
    }
  }

  // Detect embedded avatar/image from JSON
  let detectedAvatar = "";
  const avatarFields = [
    "avatar", "image", "custom_avatar", "img_url", "img", "profile_image", "character_avatar", "logo", "picture", "portrait"
  ];
  for (const field of avatarFields) {
    const val = data[field] || json[field];
    if (val && typeof val === "string") {
      const trimmedVal = val.trim();
      if (trimmedVal.startsWith("data:image/") || trimmedVal.startsWith("http://") || trimmedVal.startsWith("https://")) {
        detectedAvatar = trimmedVal;
        break;
      } else if (/^[A-Za-z0-9+/=]{100,}$/.test(trimmedVal)) {
        detectedAvatar = `data:image/png;base64,${trimmedVal}`;
        break;
      }
    }
  }

  const finalAvatar = detectedAvatar || defaultAvatar || "https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg";

  return {
    id: "char-" + Date.now(),
    name: charName,
    remark: "",
    avatar: finalAvatar,
    age: ageNum,
    gender: genderStr,
    mbti: mbtiStr,
    personality: pDetails.trim(),
    backstory: bstory.trim(),
    greeting: (data.first_mes || "").trim(),
    album: finalAvatar ? [finalAvatar] : [],
    references: [],
  };
};

export const mapSillyTavernEntry = (stEntry: any, characterId: string): WorldBookEntry => {
  if (!stEntry || typeof stEntry !== "object") {
    stEntry = { content: String(stEntry || "") };
  }

  let title = stEntry.comment || stEntry.name || stEntry.title || "";
  if (!title && stEntry.keys && Array.isArray(stEntry.keys) && stEntry.keys.length > 0) {
    title = stEntry.keys[0];
  } else if (!title && stEntry.keys) {
    title = String(stEntry.keys).split(",")[0];
  }
  if (!title) {
    title = `未命名词条-${Math.random().toString(36).substring(2, 6)}`;
  }

  let kwString = "";
  if (Array.isArray(stEntry.keys)) {
    kwString = stEntry.keys.join(", ");
  } else if (stEntry.keys) {
    kwString = String(stEntry.keys);
  } else if (stEntry.keywords) {
    kwString = String(stEntry.keywords);
  }

  let mappedPos: "after_main_prompt" | "before_char_def" | "after_char_def" | "before_chat_history" = "after_char_def";
  const stPos = stEntry.position;
  if (stPos !== undefined && stPos !== null) {
    const pStr = String(stPos).toLowerCase();
    if (pStr.includes("author") || pStr === "3") {
      mappedPos = "after_char_def";
    } else if (pStr.includes("before_char") || pStr.includes("before_body") || pStr === "0") {
      mappedPos = "before_char_def";
    } else if (pStr.includes("after_char") || pStr.includes("after_body") || pStr === "1") {
      mappedPos = "after_char_def";
    } else if (pStr.includes("chat") || pStr.includes("story") || pStr === "2") {
      mappedPos = "before_chat_history";
    } else if (pStr.includes("main") || pStr.includes("depth") || pStr === "4") {
      mappedPos = "after_main_prompt";
    }
  }

  let mappedDepth = 5;
  if (stEntry.insertion_order !== undefined && stEntry.insertion_order !== null) {
    const parsed = Number(stEntry.insertion_order);
    if (!isNaN(parsed)) {
      mappedDepth = Math.max(1, Math.min(15, parsed));
    }
  } else if (stEntry.depth !== undefined && stEntry.depth !== null) {
    const parsed = Number(stEntry.depth);
    if (!isNaN(parsed)) {
      mappedDepth = Math.max(1, Math.min(15, parsed));
    }
  }

  let trigger: "keys" | "constant" | "vector" = "keys";
  if (stEntry.constant === true || !kwString.trim()) {
    trigger = "constant";
  }

  return {
    id: `wb-entry-${characterId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: String(title),
    category: "世界书",
    content: String(stEntry.content || ""),
    timestamp: Date.now(),
    characterId: characterId || "global",
    triggerType: trigger,
    keywords: kwString || undefined,
    isActive: stEntry.enabled !== false,
    position: mappedPos,
    depth: mappedDepth
  };
};

export const parseTextToWorldBookEntries = (text: string, filename: string): WorldBookEntry[] => {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const trimmedText = text.trim();
  if (!trimmedText) return [];
  
  return [{
    id: "wb-" + Date.now() + "-" + Math.floor(Math.random() * 1000000),
    title: nameWithoutExt,
    content: trimmedText,
    characterId: "global",
    category: "导入词条",
    timestamp: Date.now()
  }];
};

export function splitTextToOfflineSegments(text: string): { content: string; isNarration: boolean }[] {
  if (!text) return [];
  const segments: { content: string; isNarration: boolean }[] = [];
  
  // Normalize line breaks and remove duplicate spaces
  let processedText = text.replace(/\r\n/g, "\n").trim();
  
  // Clean up any double empty parentheses or brackets if they happen to appear
  processedText = processedText.replace(/\(\s*\)|（\s*）/g, "").trim();

  const hasQuotes = /[“\"「『‘'”」』’']/.test(processedText);

  // This regex matches:
  // 1. Parenthesized/bracketed blocks: (...) or （...） or [...] or 【...】 or *...*
  // 2. Quoted blocks: “...” or 「...」 or 『...』 or "..." or '...'
  const regex = /(\([^)]+\)|（[^）]+）|\[[^\]]+\]|【[^】]+】|\*[^*]+\*|[“"「『‘'][^”"」』’']+[”"」』’'])/g;
  
  let match;
  let lastIndex = 0;
  
  while ((match = regex.exec(processedText)) !== null) {
    const matchText = match[0];
    const matchIndex = match.index;
    
    // Process any text between the last match and the current match
    if (matchIndex > lastIndex) {
      const betweenText = processedText.substring(lastIndex, matchIndex).trim();
      if (betweenText) {
        // Clean up trailing colons or dialogue indicators
        const cleanText = betweenText.replace(/^[a-zA-Z0-9_\u4e00-\u9fa5]+\s*[:：]\s*/, "").replace(/[:：]\s*$/, "").trim();
        if (cleanText) {
          // If there are quotes elsewhere in the response, plain text outside quotes is narration.
          // Otherwise, plain text defaults to dialogue in a bubble!
          segments.push({ content: cleanText, isNarration: hasQuotes });
        }
      }
    }
    
    // Process the match itself
    let trimmedMatch = matchText.trim();
    const isParenthesized = (
      (trimmedMatch.startsWith("(") && trimmedMatch.endsWith(")")) ||
      (trimmedMatch.startsWith("（") && trimmedMatch.endsWith("）")) ||
      (trimmedMatch.startsWith("[") && trimmedMatch.endsWith("]")) ||
      (trimmedMatch.startsWith("【") && trimmedMatch.endsWith("】")) ||
      (trimmedMatch.startsWith("*") && trimmedMatch.endsWith("*"))
    );
    
    if (isParenthesized) {
      // Strip the parentheses
      const cleanContent = trimmedMatch.substring(1, trimmedMatch.length - 1).trim();
      if (cleanContent) {
        segments.push({ content: cleanContent, isNarration: true });
      }
    } else {
      // It's a quoted block, strip quotes
      const cleanContent = trimmedMatch.substring(1, trimmedMatch.length - 1).trim();
      if (cleanContent) {
        segments.push({ content: cleanContent, isNarration: false });
      }
    }
    
    lastIndex = regex.lastIndex;
  }
  
  // Process any remaining text after the last match
  if (lastIndex < processedText.length) {
    const remainingText = processedText.substring(lastIndex).trim();
    if (remainingText) {
      const cleanText = remainingText.replace(/^[a-zA-Z0-9_\u4e00-\u9fa5]+\s*[:：]\s*/, "").replace(/[:：]\s*$/, "").trim();
      if (cleanText) {
        segments.push({ content: cleanText, isNarration: hasQuotes });
      }
    }
  }
  
  return segments;
}

export function cleanOnlineMessage(text: string, disableBracketActions: boolean): string {
  if (!text) return "";
  
  // Strip any accidental "[发送时间: ...]" prefixes from the model output
  let processedText = text.replace(/\[\s*发送时间\s*:\s*[^\]]+\]/gi, "").trim();
  
  // Clean up any double empty parentheses or brackets if they happen to appear
  processedText = processedText.replace(/\(\s*\)|（\s*）/g, "").trim();

  // Check if there are any quotes in the response (Chinese or standard quotes)
  const hasQuotes = /[“「『”」』]/.test(processedText);
  
  if (hasQuotes) {
    // If there are quotes, we ONLY extract the content inside quotes as the dialogue,
    // and completely discard all narration/scenery/parentheses outside the quotes!
    const regex = /[“「『]([^”」』]+)[”」』]/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(processedText)) !== null) {
      let content = match[1].trim();
      if (content) {
        // If disableBracketActions is enabled, let's also remove any parenthesized/bracketed action parts inside the quote
        // E.g. “（微笑）你醒了？” -> “你醒了？”
        if (disableBracketActions) {
          content = content.replace(/\([^)]*\)/g, "");
          content = content.replace(/（[^）]*）/g, "");
          content = content.replace(/\*[^*]*\*/g, "");
        }
        content = content.trim();
        if (content) {
          matches.push(content);
        }
      }
    }
    if (matches.length > 0) {
      return matches.join("\n").trim();
    }
  }
  
  // If there are no quotes, we keep the text, but filter out any lines or parts of lines that are parenthesized/bracketed actions
  const lines = processedText.split(/\r?\n/);
  const cleanedLines: string[] = [];
  
  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check if the entire line is wrapped in parentheses/brackets/asterisks (representing action/narration settings)
    const isActionOrNarrationLine = (
      (trimmed.startsWith("(") && trimmed.endsWith(")")) ||
      (trimmed.startsWith("（") && trimmed.endsWith("）")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("【") && trimmed.endsWith("】")) ||
      (trimmed.startsWith("*") && trimmed.endsWith("*"))
    );
    
    if (disableBracketActions && isActionOrNarrationLine) {
      continue; // Skip entire narration line
    }
    
    // Check for common narrative cues at the start of a line
    // E.g. "他..." or "你..." describing physical scene
    const isNarrativeScene = trimmed.length > 15 && 
      (trimmed.startsWith("他") || trimmed.startsWith("她") || trimmed.startsWith("你") || trimmed.startsWith("我")) &&
      (trimmed.includes("走进来") || trimmed.includes("端着") || trimmed.includes("看着") || trimmed.includes("拿着") || trimmed.includes("坐下"));
      
    if (disableBracketActions && isNarrativeScene) {
      continue; // Skip narrative scene line
    }
    
    // Remove inline bracketed action descriptions
    if (disableBracketActions) {
      trimmed = trimmed.replace(/\([^)]*\)/g, "");
      trimmed = trimmed.replace(/（[^）]*）/g, "");
      trimmed = trimmed.replace(/\*[^*]*\*/g, "");
    }
    
    // Clean up spaces and punctuation
    trimmed = trimmed.replace(/\s+/g, " ").trim();
    if (disableBracketActions) {
      trimmed = trimmed.replace(/[,，、：:]\s*$/, "").trim();
    }
    
    if (trimmed) {
      cleanedLines.push(trimmed);
    }
  }
  
  return cleanedLines.join("\n").trim();
}

export function splitIntoWeChatBubbles(text: string, keepPeriods: boolean = false): string[] {
  if (!text) return [];
  
  // Split by newlines first to ensure each paragraph/line break gets its own bubble
  const lines = text.split(/\r?\n/);
  const results: string[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    // Do not split red packet lines
    if (trimmedLine.startsWith("[红包]")) {
      results.push(trimmedLine);
      continue;
    }
    
    // Split the line by major sentence endings: 。！？!?
    const regex = /[^。！？!?]+[。！？!?]*/g;
    const matches = trimmedLine.match(regex);
    if (!matches) {
      let finalBubble = trimmedLine;
      if (!keepPeriods && finalBubble.endsWith("。")) {
        finalBubble = finalBubble.replace(/。+$/, "");
      }
      if (finalBubble.trim()) {
        results.push(finalBubble.trim());
      }
      continue;
    }
    
    for (const match of matches) {
      let bubbleText = match.trim();
      if (!bubbleText) continue;
      
      if (!keepPeriods && bubbleText.endsWith("。")) {
        bubbleText = bubbleText.replace(/。+$/, "");
      }
      
      if (bubbleText.trim()) {
        results.push(bubbleText.trim());
      }
    }
  }
  
  return results.length > 0 ? results : [text];
}

export function compressImage(file: File, maxWidth: number, maxHeight: number, quality: number = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress as jpeg to save massive space
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// @ts-ignore
import mammothCode from "mammoth/mammoth.browser.min.js?raw";

export async function safeParseDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const g = typeof window !== "undefined" ? window : globalThis;
  // @ts-ignore
  if (!g.mammoth) {
    try {
      const fn = new Function("exports", "module", "define", mammothCode);
      fn(undefined, undefined, undefined);
    } catch (e) {
      console.error("Failed to load mammoth browser bundle", e);
      throw new Error("初始化 DOCX 解析器失败");
    }
  }
  // @ts-ignore
  const mammothInstance = g.mammoth;
  if (!mammothInstance) {
    throw new Error("DOCX 解析器未加载成功");
  }
  const result = await mammothInstance.extractRawText({ arrayBuffer });
  return result.value;
}



