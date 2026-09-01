import { Character, WorldBookEntry } from "../types";
import { normalizeImportedWorldBookPosition } from "../domain/worldbook/worldBookPosition";
import JSZip from "jszip";
import { createId } from "../core/id/createId";

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
  let ageNum: number | "" | "∞" = "";
  if (data.age !== undefined && data.age !== null && data.age !== "") {
    const rawAge = String(data.age).trim();
    if (/^(?:∞|无限|永恒)$/i.test(rawAge)) ageNum = "∞";
    else {
      const parsedAge = parseInt(rawAge);
      if (!isNaN(parsedAge)) ageNum = parsedAge;
    }
  } else {
    const infiniteAgeMatch = pDetails.match(/(?:年龄|Age|age|岁)[:：\s]*(∞|无限|永恒)/i);
    const ageMatch = pDetails.match(/(?:年龄|Age|age|岁)[:：\s]*(\d+)/i);
    if (infiniteAgeMatch) ageNum = "∞";
    else if (ageMatch) ageNum = parseInt(ageMatch[1]);
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

  const mappedPos = normalizeImportedWorldBookPosition(stEntry.position, "silly-tavern");

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
    id: createId(`wb-entry-${characterId}`),
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
    id: createId("wb"),
    title: nameWithoutExt,
    content: trimmedText,
    characterId: "global",
    category: "导入词条",
    timestamp: Date.now(),
    triggerType: "constant",
    isActive: true,
    position: "after_char_def",
    depth: 5,
  }];
};

export function cleanOnlineMessage(text: string, disableBracketActions: boolean): string {
  if (!text) return "";
  
  // Strip accidental hidden date-time metadata, including model-shortened
  // variants such as "[时间：2026-08-11 23:42]".
  let processedText = text.replace(/\[\s*(?:历史发送时间|历史时间|当前时间|本地时间|现实时间|时间戳|消息时间|发送时间|时间)\s*[:：]\s*[^\]]*(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2})[^\]]*(?:\d{1,2}\s*[:：]\s*\d{2})[^\]]*\]/gi, "").trim();
  
  // Clean up any double empty parentheses or brackets if they happen to appear
  processedText = processedText.replace(/\(\s*\)|（\s*）/g, "").trim();

  // Check if there are any quotes in the response (Chinese or standard quotes)
  const hasQuotes = /[“「『”」』]/.test(processedText);
  
  if (hasQuotes) {
    if (!disableBracketActions) {
      // When filtering is off, preserve concise parenthesized actions that sit
      // outside quoted dialogue (for example: （轻笑）“你来了”). The old
      // quoted-text branch kept only dialogue and silently discarded them.
      const tokens = processedText.match(/\([^)]*\)|（[^）]*）|\*[^*]+\*|[“「『][^”」』]+[”」』]/g);
      if (tokens && tokens.length > 0) return tokens.join("\n").trim();
    }
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
    if (!trimmed) {
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== "") cleanedLines.push("");
      continue;
    }
    
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
  
  return cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function splitIntoWeChatBubbles(text: string, _keepPeriods: boolean = false): string[] {
  if (!text) return [];

  // This is only a safety limit for an unbroken, very long answer. The model
  // supplied blank lines remain the primary semantic bubble boundaries.
  const MAX_BUBBLE_LENGTH = 120;
  const isSpecialMessage = (line: string): boolean =>
    line.startsWith("[红包]")
    || line.startsWith("[转账]")
    || line.startsWith("[系统]")
    || line.startsWith("[语音")
    || line.startsWith("[表情]|")
    || line.startsWith("[语音通话]");
  const isExplicitSpeakerLine = (line: string): boolean =>
    !line.startsWith("[")
    && !line.startsWith("【")
    && /^[^：:\n]{1,24}\s*[：:](?=\s*\S)/u.test(line);
  const isStructuredFieldLine = (line: string): boolean => /^【[^】\n]+】\s*[：:]/u.test(line);
  const results: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;

    // Profile cards and other labelled lists are one semantic answer. Keep
    // their line breaks visible instead of turning every field into a bubble.
    if (paragraph.every(isStructuredFieldLine)) {
      results.push(paragraph.join("\n").trim());
      paragraph = [];
      return;
    }

    const paragraphText = paragraph.join("\n").trim();
    if (paragraphText.length <= MAX_BUBBLE_LENGTH) {
      results.push(paragraphText);
      paragraph = [];
      return;
    }

    // If the model omitted semantic blank lines, only split an unusually
    // long block at complete sentence boundaries. There is deliberately no
    // fixed sentence-count rule here: two, four, or more short sentences can
    // stay together when they form one coherent reply.
    const segments = paragraph.flatMap((line) => line.match(/[^。！？!?]+[。！？!?]+|[^。！？!?]+$/gu) || [line])
      .map((segment) => segment.trim())
      .filter(Boolean);
    let bubble = "";
    const flushBubble = () => {
      if (!bubble) return;
      results.push(bubble.trim());
      bubble = "";
    };
    for (const segment of segments) {
      const candidate = bubble ? `${bubble}${segment}` : segment;
      if (bubble && candidate.length > MAX_BUBBLE_LENGTH) flushBubble();
      if (segment.length > MAX_BUBBLE_LENGTH) {
        for (let index = 0; index < segment.length; index += MAX_BUBBLE_LENGTH) {
          const chunk = segment.slice(index, index + MAX_BUBBLE_LENGTH);
          if (index + MAX_BUBBLE_LENGTH < segment.length) results.push(chunk);
          else bubble = chunk;
        }
      } else {
        bubble += segment;
      }
    }
    flushBubble();
    paragraph = [];
  };

  // Ordinary content follows semantic boundaries supplied by the model.
  // Blank lines, special messages, and speaker labels remain explicit boundaries.
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    if (isSpecialMessage(line)) {
      flushParagraph();
      results.push(line);
      continue;
    }
    if (isExplicitSpeakerLine(line) && paragraph.length > 0) flushParagraph();
    paragraph.push(line);
  }
  flushParagraph();

  return results.length > 0 ? results : [text.trim()];
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

/**
 * Keeps transparent PNG uploads transparent while continuing to compress
 * ordinary images as JPEG. A PNG data URL therefore also acts as persisted
 * rendering metadata for frameless icons/widgets without a second store.
 */
export function compressImagePreservingTransparency(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const source = event.target?.result as string;
      const image = new Image();
      image.onload = () => {
        let width = image.width;
        let height = image.height;
        if (width > maxWidth || height > maxHeight) {
          const scale = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(source);
          return;
        }
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        let hasTransparency = false;
        if (file.type.toLowerCase() === "image/png") {
          const pixels = context.getImageData(0, 0, width, height).data;
          for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] < 255) {
              hasTransparency = true;
              break;
            }
          }
        }
        resolve(hasTransparency
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = reject;
      image.src = source;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const isTransparencyPreservedImage = (value?: string | null): boolean =>
  /^data:image\/png(?:;|,)/i.test(value || "");

let mammothCodePromise: Promise<string> | null = null;

const loadMammothCode = async (): Promise<string> => {
  if (!mammothCodePromise) {
    // Keep the large browser parser out of the initial bundle. It is only
    // needed when a user imports a DOCX file; the OOXML path remains the
    // immediate compatibility fallback if this optional chunk fails.
    // @ts-ignore Vite resolves the ?raw asset at build time.
    mammothCodePromise = import("mammoth/mammoth.browser.min.js?raw")
      .then((module) => module.default);
  }
  return mammothCodePromise;
};

const decodeDocxXml = (value: string): string => value
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));

export const extractTextFromDocxXml = (xml: string): string => decodeDocxXml(xml
  .replace(/<w:tab\b[^>]*\/?\s*>/gi, "\t")
  .replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/gi, "\n")
  .replace(/<\/w:p>/gi, "\n")
  .replace(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gi, "$1")
  .replace(/<[^>]+>/g, ""))
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

export async function extractSupplementalDocxText(arrayBuffer: ArrayBuffer): Promise<{ main: string; supplemental: string }> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("string") || "";
  const main = extractTextFromDocxXml(documentXml);
  const sections: string[] = [];
  const supplementalFiles = Object.keys(zip.files)
    .filter((name) => /^word\/(?:header\d+|footer\d+|comments|footnotes|endnotes)\.xml$/i.test(name))
    .sort();
  for (const name of supplementalFiles) {
    const xml = await zip.file(name)?.async("string") || "";
    const content = extractTextFromDocxXml(xml);
    if (!content || sections.includes(content)) continue;
    const label = /header/i.test(name)
      ? "页眉"
      : /footer/i.test(name)
        ? "页脚"
        : /footnotes/i.test(name)
          ? "脚注"
          : /endnotes/i.test(name)
            ? "尾注"
            : "批注";
    sections.push(`【${label}】\n${content}`);
  }
  return { main, supplemental: sections.join("\n\n") };
}

export async function safeParseDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  // OOXML is the compatibility baseline. It does not require dynamic code
  // execution, so restrictive and older mobile WebViews can still import the
  // complete document when the Mammoth browser bundle cannot initialize.
  const extracted = await extractSupplementalDocxText(arrayBuffer);
  const g = typeof window !== "undefined" ? window : globalThis;
  // @ts-ignore
  if (!g.mammoth) {
    try {
      const mammothCode = await loadMammothCode();
      const fn = new Function("exports", "module", "define", mammothCode);
      fn(undefined, undefined, undefined);
    } catch (e) {
      console.error("Failed to load mammoth browser bundle", e);
      if (extracted.main) {
        return [extracted.main, extracted.supplemental].filter(Boolean).join("\n\n");
      }
      throw new Error("初始化 DOCX 解析器失败");
    }
  }
  // @ts-ignore
  const mammothInstance = g.mammoth;
  if (!mammothInstance) {
    if (extracted.main) {
      return [extracted.main, extracted.supplemental].filter(Boolean).join("\n\n");
    }
    throw new Error("DOCX 解析器未加载成功");
  }
  let mammothText = "";
  try {
    const result = await mammothInstance.extractRawText({ arrayBuffer });
    mammothText = typeof result.value === "string" ? result.value : "";
  } catch (error) {
    console.warn("Mammoth DOCX extraction failed; using OOXML fallback.", error);
  }
  const compact = (value: string) => value.replace(/\s+/gu, "");
  const rawCompact = compact(extracted.main);
  const mammothCompact = compact(mammothText);
  // Mammoth's paragraph spacing is preferred only when it contains every
  // piece of OOXML body text. A simple length comparison can hide omissions.
  const main = rawCompact && mammothCompact.includes(rawCompact) ? mammothText : extracted.main;
  return [main, extracted.supplemental].filter((part) => part.trim()).join("\n\n");
}



