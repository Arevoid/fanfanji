import type { UserSettings } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { apiChat } from "../../utils/apiHelper";
import { buildMemoryContext } from "../characterKnowledge/services/memoryContextGateway";
import { CHARACTER_EXPERIENCE_INSTRUCTION, normalizeCharacterExperience } from "../../domain/memory/characterExperience";

/** Movie knowledge stays inside the watched-content prompt; personal memory comes from the canonical relationship. */
export async function requestCinemaMemoryReply(input: { relation?: CharacterRelationship; characterId: string; userIdentityId: string;
  settings: UserSettings; query: string; params: Parameters<typeof apiChat>[0]; request?: typeof apiChat }) {
  const memory = input.relation ? await buildMemoryContext({ surface: "cinema", relation: input.relation, characterId: input.characterId,
    userIdentityId: input.userIdentityId, settings: input.settings, audience: "relation_private", query: input.query,
    alreadyPromptedTexts: input.params.history?.map(turn => turn.text) }) : "";
  const response = await (input.request || apiChat)({ ...input.params, systemInstruction: (input.params.systemInstruction || "") + memory
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
