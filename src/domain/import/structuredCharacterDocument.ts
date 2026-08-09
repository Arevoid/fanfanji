export interface CharacterDocumentWorldBookDraft {
  comment: string;
  content: string;
  keys: string[];
  constant: boolean;
  position: "before_char" | "after_char";
  depth: number;
  enabled: boolean;
}

export interface StructuredCharacterDocument {
  detectedSections: boolean;
  name: string;
  age: number | "";
  gender: string;
  mbti: string;
  description: string;
  personality: string;
  worldBookEntries: CharacterDocumentWorldBookDraft[];
}

const PERSONA_MARKER = /(?:^|\n)\s*(?:↓\s*)?人设部分[。.]?\s*(?:\n|$)/i;
const WORLD_BOOK_MARKER = /(?:^|\n)\s*(?:↓\s*)?世界书部分[。.]?\s*(?:\n|$)/i;
const STRUCTURAL_TAG = /^<\/?[a-z][\w-]*>$/i;
const HEADING = /^#{1,6}\s*(.+?)\s*$/;

const normalizeText = (text: string): string => text
  .replace(/^\uFEFF/, "")
  .replace(/\r\n?/g, "\n")
  .replace(/[ \t]+$/gm, "")
  .trim();

const cleanSectionText = (lines: readonly string[]): string => lines
  .filter((line) => !STRUCTURAL_TAG.test(line.trim()))
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const parseAge = (text: string): number | "" => {
  const match = text.match(/^\s*age\s*[:：]\s*(\d{1,3})\b/im)
    || text.match(/年龄\s*[:：]\s*(\d{1,3})/i);
  return match ? Number(match[1]) : "";
};

const parseField = (text: string, names: readonly string[]): string => {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return text.match(new RegExp(`^\\s*(?:${escaped})\\s*[:：]\\s*([^\\n]+)`, "im"))?.[1]?.trim() || "";
};

const classifyPersonaHeading = (heading: string): "description" | "personality" | null => {
  if (/(性格|行为|沟通|交流|说话|语言|关系|互动|聊天|扮演|红线|自检|补充设定|personality|behavior|communication|relationship|speech|interaction)/i.test(heading)) {
    return "personality";
  }
  if (/(核心信息|人物背景|背景|外貌|外观|习惯|生活方式|身份|经历|appearance|background|lifestyle|identity|core information)/i.test(heading)) {
    return "description";
  }
  return null;
};

const splitPersona = (text: string): { description: string; personality: string } => {
  const description: string[] = [];
  const personality: string[] = [];
  let target: "description" | "personality" = "description";

  normalizeText(text).split("\n").forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim() || STRUCTURAL_TAG.test(line.trim())) return;
    const heading = line.trim().match(HEADING)?.[1];
    const classification = heading ? classifyPersonaHeading(heading) : null;
    if (classification) target = classification;

    // Identity is projected separately by the character prompt assembler.
    if (/^\s*(?:name|age|gender|mbti|姓名|年龄|性别)\s*[:：]/i.test(line)) return;
    (target === "personality" ? personality : description).push(line);
  });

  const cleanDescription = cleanSectionText(description);
  const cleanPersonality = cleanSectionText(personality);
  if (!cleanPersonality) {
    return { description: "", personality: cleanDescription };
  }
  return { description: cleanDescription, personality: cleanPersonality };
};

const extractWorldBookKeywords = (title: string, content: string): string[] => {
  const keywords: string[] = [];
  const add = (value: string) => {
    const keyword = value.replace(/^['“”‘’"]+|['“”‘’"]+$/g, "").trim();
    if (keyword.length < 2 || keyword.length > 30) return;
    if (/[，。；！？]/.test(keyword)) return;
    if (/^rule_(?:name|key|type|type_describe)$/i.test(keyword)) return;
    if (/^(基础信息|详细描述|概况|页面|性格基调|互动反馈|特殊限制|可用交互功能)$/i.test(keyword)) return;
    if (!keywords.includes(keyword)) keywords.push(keyword);
  };

  content.match(/^\s*rule_key\s*[:：]\s*(.+)$/im)?.[1]
    ?.split(/[,，、;；]/)
    .forEach(add);
  title.split(/[()（）/、]/).forEach(add);
  for (const match of content.matchAll(/["“'‘]([^"”'’\n]{2,30})["”'’]/g)) add(match[1]);
  for (const line of content.split("\n")) {
    const label = line.match(/^\s*[-*]?\s*([^:#：]{2,24})\s*[:：]/)?.[1];
    if (label) add(label);
    if (keywords.length >= 24) break;
  }
  return keywords.slice(0, 24);
};

const splitWorldBook = (text: string, fallbackTitle: string): CharacterDocumentWorldBookDraft[] => {
  const drafts: CharacterDocumentWorldBookDraft[] = [];
  let title = `${fallbackTitle}世界观`;
  let lines: string[] = [];

  const flush = () => {
    const content = cleanSectionText(lines);
    lines = [];
    if (!content) return;
    const constant = /(基础信息|核心设定|世界观总览|world overview)/i.test(title);
    const isRule = /(规则|规范|限制|nsfw|性偏好|性反应|癖好)/i.test(title);
    drafts.push({
      comment: title,
      content,
      keys: extractWorldBookKeywords(title, content),
      constant,
      position: constant || !isRule ? "before_char" : "after_char",
      depth: isRule ? 4 : 5,
      enabled: true,
    });
  };

  normalizeText(text).split("\n").forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) return;
    const tag = trimmed.match(/^<([a-z][\w-]*)>$/i)?.[1];
    if (tag) {
      flush();
      title = /rule/i.test(tag) ? "规则设定" : (/world/i.test(tag) ? "世界观" : tag);
      return;
    }
    if (/^<\//.test(trimmed)) {
      flush();
      return;
    }
    const heading = trimmed.match(HEADING)?.[1]?.trim();
    if (heading) {
      flush();
      title = heading;
    }
    lines.push(line);
  });
  flush();
  return drafts;
};

export function parseStructuredCharacterDocument(text: string, filename: string): StructuredCharacterDocument {
  const normalized = normalizeText(text);
  const fallbackName = filename.replace(/\.[^/.]+$/, "").trim() || "未命名角色";
  const personaMarker = PERSONA_MARKER.exec(normalized);
  const worldMarker = WORLD_BOOK_MARKER.exec(normalized);
  const detectedSections = Boolean(worldMarker || personaMarker);

  const personaStart = personaMarker ? personaMarker.index + personaMarker[0].length : 0;
  const personaEnd = worldMarker ? worldMarker.index : normalized.length;
  const personaSource = normalized.slice(personaStart, personaEnd).trim();
  const worldBookSource = worldMarker
    ? normalized.slice(worldMarker.index + worldMarker[0].length).trim()
    : "";
  const persona = splitPersona(personaSource);

  const name = parseField(personaSource, ["name", "姓名"]) || fallbackName;
  const gender = parseField(personaSource, ["gender", "性别"]);
  const explicitMbti = parseField(personaSource, ["mbti"]);
  const inferredMbti = personaSource.match(/\b(?:INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)\b/i)?.[0] || "";

  return {
    detectedSections,
    name,
    age: parseAge(personaSource),
    gender,
    mbti: (explicitMbti || inferredMbti).toUpperCase(),
    description: persona.description,
    personality: persona.personality || personaSource,
    worldBookEntries: worldBookSource ? splitWorldBook(worldBookSource, name) : [],
  };
}
