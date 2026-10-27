import assert from "node:assert/strict";
import type { Character, OfflineStory, UserSettings } from "../src/types";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { saveKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { captureOfflineMemoryReadFrame } from "../src/features/offline/services/offlineMemoryReadFrame";
import { useOfflineStoryGenerationActions } from "../src/features/offline/hooks/useOfflineStoryGenerationActions";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
const chars = [{ id: "a", name: "林澈", personality: "温和", avatar: "", backstory: "A专属过去" }, { id: "b", name: "乔安", personality: "冷静", avatar: "", backstory: "B专属过去" }] as Character[];
chars.push(...Array.from({length:4},(_,i)=>({id:`extra-${i}`,name:`角色${i+3}`,personality:"谨慎",avatar:"",backstory:`extra-${i}专属过去`} as Character)));
const relations = chars.map((char) => ({ id: `r-${char.id}`, characterId: char.id, userIdentityId: "u", conversationId: `c-${char.id}`, relationship: "friend", createdAt: 1, updatedAt: 1 })) as CharacterRelationship[];
const facts = relations.map((relation, index) => ({ characterId: relation.characterId, relationId: relation.id, userIdentityId: "u", conversationId: relation.conversationId, id: `secret-${index}`,
  statement: `用户的秘密口令是${index === 0 ? "橘色小猫" : index === 1 ? "蓝色小狗" : `私密代号${index}`}`, kind: "fact", subject: "user", temporalStatus: "present", truthStatus: "asserted", confidence: .85, userConfirmed: false,
  recordedAt: 100, status: "active", visibility: "relation_private", schemaVersion: 1, source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: `secret-${index}`, messageIds: [`secret-${index}`] } })) as KnowledgeClaim[];
saveKnowledgeClaims(facts);
const frame = captureOfflineMemoryReadFrame({ memberIds: chars.map((char) => char.id), characters: chars, relationships: relations, userIdentityId: "u", now: 200 });
const base = { id: "story", characterId: "a", relationId: "r-a", conversationId: "c-a", ownerIdentityId: "u", createdAt: 200, updatedAt: 200, messages: [], mode: "if", memoryReadFrame: frame } as OfflineStory;
async function run(story: OfflineStory) {
  const calls: { message: string; systemInstruction?: string }[] = []; let error = ""; let saved = story;
  const options = { activeStory: story, activeStoryRef: { current: story }, characters: chars, selectableCharacters: chars, relationships: relations, activeIdentityId: "u", memories: [],
    settings: { name: "测试用户", apiKey: "synthetic" } as UserSettings, worldBookEntries: [], selectedChar: chars[0], inputText: "秘密口令是什么", isGenerating: false,
    setInputText: () => {}, setIsGenerating: () => {}, setErrorMsg: (value: unknown) => { error = String(value); }, resolveCharacterId: (id: string) => id,
    saveActiveStorySnapshot: (value: OfflineStory) => { saved = value; }, showToast: () => {}, guidanceDraft: { oneTime: "", ongoing: "" }, setGuidanceDraft: () => {},
    request: async (params: { message: string; systemInstruction?: string }) => { calls.push(params); return { text: /封闭|JSON|action/u.test(params.systemInstruction || "") ? '{"action":"gentle"}' : "林澈看向窗外，轻声应了一句。" }; } };
  await useOfflineStoryGenerationActions(options).handleSendMessage();
  assert.equal(error, ""); assert.equal(saved.messages.at(-1)?.sender, "character"); return calls;
}
for (const mode of ["if", "director"] as const) {
  const calls = await run({ ...base, mode }); assert.equal(calls.length, 1); assert.doesNotMatch(JSON.stringify(calls), /橘色小猫|蓝色小狗/);
}
const imported = await run({ ...base, sourceChatId: "a" });
assert.equal(imported.length, 1); assert.match(imported[0].systemInstruction!, /橘色小猫/); assert.doesNotMatch(imported[0].systemInstruction!, /蓝色小狗/);
const group = await run({ ...base, sourceChatId: "a", characterIds: ["a", "b"] });
assert.equal(group.length, 3); assert.match(group[0].message, /橘色小猫/); assert.doesNotMatch(group[0].message, /蓝色小狗/);
assert.match(group[1].message, /蓝色小狗/); assert.doesNotMatch(group[1].message, /橘色小猫/);
assert.doesNotMatch(group[2].systemInstruction!, /橘色小猫|蓝色小狗|A专属过去|B专属过去/);
const six=await run({...base,sourceChatId:"a",characterIds:chars.map(char=>char.id)});assert.equal(six.length,7,"all six members get isolated awareness, not just first four");
for(let i=0;i<6;i++){assert.match(six[i].message,new RegExp(i===0?"橘色小猫":i===1?"蓝色小狗":`私密代号${i}`));for(let j=0;j<6;j++)if(i!==j)assert.doesNotMatch(six[i].message,new RegExp(j===0?"橘色小猫":j===1?"蓝色小狗":`私密代号${j}`));}
assert.doesNotMatch(six[6].systemInstruction!,/橘色小猫|蓝色小狗|私密代号|专属过去/);
console.log("PASS actual offline generation entry: IF/director no import, explicit frozen direct import, isolated per-member awareness calls and public multi-character request without private facts");
