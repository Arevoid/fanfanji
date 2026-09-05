import type { Character, CharacterReference } from "../../types";
import type { CharacterRelationshipState } from "../relationship/characterRelationship";
import type { PromptBlock } from "./PromptBlock";

export const CHARACTER_PERSONA_PROTECTION = `[角色人设最高优先级]
角色卡、参考资料中明确写出的稳定表达习惯，以及角色专属的人设规则，共同决定角色对用户的称呼、亲疏、情感方向、主动程度、话量、口癖、语气、标点和禁用口吻。任何“活人感”、自然聊天、媒体使用、回复长度或通用建议都只是软参考，不得覆盖、平均化或改写这些特征。
- 即使两个角色都热情、黏人、冷淡或毒舌，也不得套用同一套句式、安慰方式、追问方式或情绪反应；必须分别使用各自的称呼、口癖、节奏、习惯和与 user 的关系。
- 不得为了显得自然、体贴、简短或安全，就把角色统一改成礼貌安慰、温柔关心、机械追问或客服式回应。
- 热情、黏人、话痨、崇拜或深爱 user 的角色不得无故变得疏远；高冷、寡言、克制或关系疏远的角色也不得无故变得过度温柔亲密。
- 角色卡明确设定的调侃、嘴臭、傲娇、敷衍、跳脱、撒娇或特殊标点可以正常保留，只需遵守事实、台词归属和功能格式等边界。
- 通过实际称呼、措辞、反应、话量和节奏体现性格，不要向 user 解释或朗读人设标签。
- 若关系状态与角色卡中明确写出的关系、称呼或情感方向冲突，以角色卡的明确设定为准；关系状态只补充角色卡未写明的信息。`;

export const CHARACTER_LANGUAGE_POLICY = `[角色输出语言规则 / Character Reply Language]
决定角色实际发送内容所使用的语言时，严格按以下优先级执行：
1. 角色卡、背景设定、参考资料或当前生效的世界书若明确指定“说话语言、聊天语言、母语或输出语言”，始终使用该语言；不得因为 user 使用中文、界面是中文或提示词以中文书写而改成简体中文。
2. 若没有明确指定说话语言，但角色设定了国籍或明确的长期生活文化背景，则使用该角色在设定中最自然的日常主要语言。例如日本角色默认使用日语。若国籍对应多种语言且设定无法判断，才使用下面的缺省规则。
3. 只有角色资料和世界书都没有提供任何语言或国籍线索时，才默认使用简体中文。
4. 不要在正文后自动附加中文翻译、双语对照或语言说明；翻译由客户端的翻译功能单独处理。user 明确要求翻译或临时改用另一种语言时除外。`;

const STYLE_SIGNAL = /(口癖|说话|语气|语调|称呼|聊天|回复|话量|习惯|标点|句子|气泡|user|用户|相处|黏|冷淡|毒舌|嘴臭|撒娇|直球|礼貌|敬语|方言|语言|母语|输出|禁用|禁止|不会|不要|必须|绝对|台词|表达|问句|称谓|亲昵|辱追|敷衍|热情|寡言|话痨)/i;
const MAX_REFERENCE_STYLE_CHARS = 2200;
const MAX_ANCHOR_EVIDENCE_CHARS = 1800;

function splitProfileText(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[。！？；])\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function collectReferenceStyleEvidence(references: readonly CharacterReference[] | undefined): string {
  if (!references?.length) return "";
  const selected: string[] = [];
  let used = 0;
  for (const reference of references) {
    const lines = splitProfileText(reference.content).filter((line) => STYLE_SIGNAL.test(line));
    if (!lines.length) continue;
    const section = `【${reference.title || "参考资料"}】\n${lines.join("\n")}`;
    const remaining = MAX_REFERENCE_STYLE_CHARS - used;
    if (remaining <= 0) break;
    selected.push(section.slice(0, remaining));
    used += Math.min(section.length, remaining);
  }
  return selected.join("\n\n");
}

function collectAnchorEvidence(character: Pick<Character, "personality" | "backstory" | "references">): string {
  const personalityLines = splitProfileText(character.personality || "");
  const explicitPersonalityStyle = personalityLines.filter((line) => STYLE_SIGNAL.test(line));
  const candidates = [
    ...(explicitPersonalityStyle.length ? explicitPersonalityStyle : personalityLines.slice(0, 4)),
    ...splitProfileText(character.backstory || "").filter((line) => STYLE_SIGNAL.test(line)),
    ...((character.references || []).flatMap((reference) =>
      splitProfileText(reference.content).filter((line) => STYLE_SIGNAL.test(line)).map((line) => `【${reference.title || "参考资料"}】${line}`),
    )),
  ];
  const unique = [...new Set(candidates)];
  let output = "";
  for (const line of unique) {
    const prefix = output ? "\n" : "";
    const remaining = MAX_ANCHOR_EVIDENCE_CHARS - output.length - prefix.length;
    if (remaining <= 0) break;
    output += `${prefix}${line.slice(0, remaining)}`;
  }
  return output || "仅依据上方完整角色资料保持该角色自己的表达方式。";
}

export interface CharacterPromptProjection {
  description: PromptBlock;
  personality: PromptBlock;
  relationship?: PromptBlock;
  /** Repeated at the end of generic guidance so shared rules cannot wash out this character's voice. */
  expressionAnchor: PromptBlock;
}

export function projectCharacterPrompt(
  character: Pick<Character, "id" | "name" | "age" | "gender" | "mbti" | "personality" | "backstory" | "references">,
  relationship?: CharacterRelationshipState,
): CharacterPromptProjection {
  const identityLines = [
    `Name: ${character.name}`,
    character.age !== undefined && character.age !== "" ? `Age: ${character.age}` : "",
    character.gender ? `Gender: ${character.gender}` : "",
    character.mbti ? `MBTI: ${character.mbti}` : "",
  ].filter(Boolean);

  const description = `[Character Description / 角色描述]\n${identityLines.join("\n")}${
    character.backstory?.trim() ? `\n\nBackground:\n${character.backstory.trim()}` : ""
  }`;
  const referenceStyle = collectReferenceStyleEvidence(character.references);
  const personality = `[Character Personality / 角色性格与行为]\n${character.personality.trim() || "No personality was provided."}${
    referenceStyle ? `\n\n[参考资料中提炼的稳定表达特征]\n${referenceStyle}` : ""
  }\n\n${CHARACTER_PERSONA_PROTECTION}\n\n${CHARACTER_LANGUAGE_POLICY}`;
  const relationshipBlock = relationship
    ? `[Current Relationship Scope / 当前关系范围]\nRelationship state: ${relationship}\n该状态主要用于隔离本关系的聊天、记忆和故事数据。角色卡中明确写出的亲疏、称呼、情感方向和相处方式优先；仅当角色卡没有说明时，才使用该状态补充关系距离。不得因默认状态为 friend 而削弱角色卡中明确写出的爱慕、黏人、热情或特殊情感。`
    : "";
  const expressionAnchor = `[FINAL CHARACTER-SPECIFIC EXPRESSION ANCHOR / 最终角色专属表达锚点：${character.name}]
本轮必须听起来只像“${character.name}”，不能像可替换名字的通用聊天助手。下面是该角色自己的表达证据：
${collectAnchorEvidence(character)}

先按这些证据与上方完整人设决定称呼、冷暖、口癖、句式、话量、标点、主动性和对 user 的反应；再处理本轮内容。所有活人感、安慰、自然表达、媒体频率和回复长度建议都不得把这些特征改成统一模板。若当前回复原封不动换给另一位好友仍然成立，必须按“${character.name}”的独有表达方式重写。`;

  return {
    description: {
      id: "character-description",
      kind: "char-description",
      content: description,
      sourceId: `character:${character.id}:description`,
    },
    personality: {
      id: "character-personality",
      kind: "char-personality",
      content: personality,
      sourceId: `character:${character.id}:personality`,
    },
    relationship: relationshipBlock ? {
      id: "character-relationship",
      kind: "relationship",
      content: relationshipBlock,
      sourceId: `character:${character.id}:relationship`,
    } : undefined,
    expressionAnchor: {
      id: "character-expression-anchor",
      kind: "char-personality",
      content: expressionAnchor,
      sourceId: `character:${character.id}:expression-anchor`,
    },
  };
}
