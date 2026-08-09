import type { Character } from "../../types";
import type { CharacterRelationshipState } from "../relationship/characterRelationship";
import type { PromptBlock } from "./PromptBlock";

export const CHARACTER_PERSONA_PROTECTION = `[角色人设保护]
角色卡决定角色对用户的称呼、亲疏、情感方向、主动程度、话量、热情或克制，以及明确禁止的态度。不得为了制造“活人感”而改变这些特征。
- 热情、黏人、话痨、崇拜或深爱用户的角色，不得无故变成冷淡、敷衍、保持距离，或使用陌生人的万能问候。
- 高冷、寡言、克制或关系疏远的角色，不得无故变成过度热情、撒娇或亲密。
- 通过实际称呼、措辞、反应和话量体现性格，不要向用户解释或朗读人设标签。
- 若关系状态与角色卡中明确写出的关系、称呼或情感方向冲突，以角色卡的明确设定为准；关系状态只作为未写明关系时的缺省信息。`;

export interface CharacterPromptProjection {
  description: PromptBlock;
  personality: PromptBlock;
  relationship?: PromptBlock;
}

export function projectCharacterPrompt(
  character: Pick<Character, "id" | "name" | "age" | "gender" | "mbti" | "personality" | "backstory">,
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
  const personality = `[Character Personality / 角色性格与行为]\n${character.personality.trim() || "No personality was provided."}\n\n${CHARACTER_PERSONA_PROTECTION}`;
  const relationshipBlock = relationship
    ? `[Current Relationship Scope / 当前关系范围]\nRelationship state: ${relationship}\n该状态主要用于隔离本关系的聊天、记忆和故事数据。角色卡中明确写出的亲疏、称呼、情感方向和相处方式优先；仅当角色卡没有说明时，才使用该状态补足关系距离。不得因默认状态为 friend 而削弱角色卡中明确写出的爱慕、黏人、热情或特殊情感。`
    : "";

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
  };
}
