import { buildCompanionPersona } from "../../domain/character/companionPersona";
import { getVisibleWorldBookEntries } from "../../utils/worldBook";
import type { Character, WorldBookEntry, UserSettings } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { apiChat } from "../../utils/apiHelper";
import { buildMemoryContext } from "../characterKnowledge/services/memoryContextGateway";
import { CHARACTER_EXPERIENCE_INSTRUCTION, normalizeCharacterExperience } from "../../domain/memory/characterExperience";

/** Movie knowledge stays inside the watched-content prompt; personal memory comes from the canonical relationship. */
export async function requestCinemaMemoryReply(input: { relation?: CharacterRelationship; characterId: string; userIdentityId: string;
  character?: Character; worldBookEntries?: WorldBookEntry[];
  settings: UserSettings; query: string; params: Parameters<typeof apiChat>[0]; request?: typeof apiChat }) {
  if (input.character && (input.character.id !== input.characterId || !input.relation || input.relation.characterId !== input.characterId || input.relation.userIdentityId !== input.userIdentityId)) throw new Error("观影角色或关系范围不匹配");
  const persona = input.character ? buildCompanionPersona(input.character, input.relation) : "";
  const world = input.character && input.relation ? getVisibleWorldBookEntries(input.worldBookEntries || [], input.characterId, {scenario:"offline", characterId:input.characterId, userIdentityId:input.userIdentityId, relationId:input.relation.id}).map(entry => `【${entry.title}】${entry.content}`).join("\n").slice(0,12000) : "";
  const memory = input.relation ? await buildMemoryContext({ surface: "cinema", relation: input.relation, characterId: input.characterId,
    userIdentityId: input.userIdentityId, settings: input.settings, audience: "relation_private", query: input.query,
    alreadyPromptedTexts: input.params.history?.map(turn => turn.text) }) : "";
  const response = await (input.request || apiChat)({ ...input.params, systemInstruction: (input.params.systemInstruction || "") + "\n" + persona + (world ? "\n【当前关系可见的世界书】\n" + world : "") + memory
    + "\n像两个人边看边聊，直接回应用户眼前的话和已播放画面，具体关注点与措辞服从角色本人。没有被要求时不写影评报告、不分点概括主题、不做客服式安慰，也不每次用追问结尾。可以只说一两句，不必强行升华；用户明确要求深入分析时再展开。世界书和角色背景不是已观看剧情，不能用于剧透。"
    + "\n本次最终输出为 JSON {body:角色实际说的话,experience:null}，body仍遵守原有回复要求；experience是内部可选主观感悟，不是作品事实。"
    + CHARACTER_EXPERIENCE_INSTRUCTION });
  try {
    const raw = JSON.parse(response.text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/i, ""));
    if (typeof raw.body === "string" && raw.body.trim()) return { ...response, text: raw.body, experience: normalizeCharacterExperience(raw.experience, raw.body) };
  } catch { /* Existing plain-text providers remain usable; no repair request. */ }
  if (/^\s*(?:\x60\x60\x60(?:json)?\s*)?\{/i.test(response.text) && /"(?:body|experience)"\s*:/.test(response.text)) {
    throw new Error("观影回复格式未通过校验，未额外调用 API 重试");
  }
  return { ...response, experience: undefined };
}
