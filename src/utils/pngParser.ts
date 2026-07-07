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
  
  let bstory = data.creator_notes || data.creator || "";
  if (!bstory.trim()) {
    bstory = "来自导入文件。";
  }
  
  // Try mapping common fields
  let ageNum: number | "" = "";
  if (data.age !== undefined && data.age !== null && data.age !== "") {
    const parsedAge = parseInt(String(data.age));
    if (!isNaN(parsedAge)) {
      ageNum = parsedAge;
    }
  } else {
    const ageMatch = pDetails.match(/(?:年龄|Age|age|岁)[:：\s]*(\d+)/);
    if (ageMatch) {
      ageNum = parseInt(ageMatch[1]);
    }
  }

  const genderStr = data.gender || "";
  
  // Heuristic for MBTI
  let mbtiStr = "INFP";
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

  return {
    id: "char-" + Date.now(),
    name: charName,
    remark: "",
    avatar: defaultAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop",
    age: ageNum,
    gender: genderStr,
    mbti: mbtiStr,
    personality: pDetails.trim() || "导入的性格设定。",
    backstory: bstory.trim(),
    greeting: (data.first_mes || "").trim(),
    album: defaultAvatar ? [defaultAvatar] : [],
    references: [],
  };
};

export const mapSillyTavernEntry = (stEntry: any, characterId: string): WorldBookEntry => {
  let title = stEntry.comment || stEntry.name || stEntry.title || "";
  if (!title && stEntry.keys && stEntry.keys.length > 0) {
    title = Array.isArray(stEntry.keys) ? stEntry.keys[0] : String(stEntry.keys).split(",")[0];
  }
  if (!title) {
    title = `未命名词条-${Math.random().toString(36).substring(2, 6)}`;
  }

  let kwString = "";
  if (Array.isArray(stEntry.keys)) {
    kwString = stEntry.keys.join(", ");
  } else if (stEntry.keys) {
    kwString = String(stEntry.keys);
  }

  let mappedPos: "after_main_prompt" | "before_char_def" | "after_char_def" | "before_chat_history" = "after_char_def";
  const stPos = stEntry.position;
  if (stPos !== undefined) {
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
  if (stEntry.insertion_order !== undefined) {
    mappedDepth = Math.max(1, Math.min(15, Number(stEntry.insertion_order)));
  } else if (stEntry.depth !== undefined) {
    mappedDepth = Math.max(1, Math.min(15, Number(stEntry.depth)));
  }

  let trigger: "keys" | "constant" | "vector" = "keys";
  if (stEntry.constant === true || !kwString.trim()) {
    trigger = "constant";
  }

  return {
    id: `wb-entry-${characterId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: title,
    category: "世界书",
    content: stEntry.content || "",
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
