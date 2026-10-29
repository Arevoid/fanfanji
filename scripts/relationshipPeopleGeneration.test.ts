import assert from "node:assert/strict";
import { generateRelationshipPeople, parseRelationshipPeople, relationshipSourceBatches } from "../src/features/relationshipNetwork/services/generateRelationshipPeople";
import { saveGeneratedRelationshipPeople } from "../src/features/relationshipNetwork/services/saveGeneratedRelationshipPeople";
import { createEmptyRelationshipNetwork } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";
import type { Character, UserSettings, WorldBookEntry } from "../src/types";
import type { RelationshipNetworkNpc } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";

const character = { id: "A", name: "小舟", personality: "小舟的导师是李老师。", backstory: "小舟的母亲经营花店。" } as Character;
const worldBookEntries = [
  { id: "global", title: "时代", content: "生活在现代。", scope: { kind: "global" } },
  { id: "self", title: "人际", content: "小舟的同事是林雨。", characterId: "A" },
  { id: "other", title: "秘密", content: "OTHER_CHARACTER_SECRET", characterId: "B" },
  { id: "inactive", title: "关闭", content: "DISABLED_ENTRY", isActive: false },
  { id: "identity", title: "别人身份", content: "OTHER_IDENTITY_SECRET", scope: { kind: "identity", userIdentityId: "else" } },
  { id: "relation", title: "别人关系", content: "OTHER_RELATION_SECRET", scope: { kind: "relationship", characterId: "A", userIdentityId: "owner", relationId: "wrong" } },
] as WorldBookEntry[];
const input = { character, characters: [character], settings: { apiKey: "synthetic-key", selectedModel: "synthetic-model" } as UserSettings, worldBookEntries, identityId: "owner", existingNames: [] };
const source = relationshipSourceBatches(input).join("");
assert.ok(source.includes("生活在现代") && source.includes("同事是林雨"));
assert.doesNotMatch(source, /SECRET|DISABLED_ENTRY/);
assert.equal(relationshipSourceBatches(input, 30).join(""), source, "batch sizing must never truncate source text");
const row = { name: "李老师", summary: "大学导师", relationship: "导师", reverseRelationship: "学生", evidence: "小舟的导师是李老师。" };
assert.throws(() => parseRelationshipPeople("not json", source), /无法解析/);
assert.throws(() => parseRelationshipPeople(JSON.stringify({ people: [{ ...row, evidence: "invented" }] }), source), /依据/);
assert.throws(() => parseRelationshipPeople(JSON.stringify({ people: [{ ...row, name: "设定中没有的虚构名字" }] }), source), /依据/);
let calls = 0;
const generated = await generateRelationshipPeople({ ...input, call: async request => {
  calls++; assert.equal(request.singleAttempt, true); assert.equal(request.history.length, 0);
  assert.equal(request.purpose, "relationship_generate"); assert.equal(request.characterId, "A");
  assert.doesNotMatch(request.message, /SECRET/);
  return { text: JSON.stringify({ people: [row, row] }) };
} });
assert.equal(calls, 1); assert.equal(generated.length, 1);
const independent = { ...character, characterApi: { enabled: true, custom: { name: "test", apiEndpoint: "https://synthetic.invalid/v1", apiKey: "role-key", selectedModel: "role-model", apiTemperature: 0.4, streamCompatible: false } } };
await generateRelationshipPeople({ ...input, character: independent, characters: [independent], call: async request => {
  assert.equal(request.apiKey, "role-key"); assert.equal(request.model, "role-model");
  return { text: '{"people":[]}' };
} });
let failures = 0;
await assert.rejects(() => generateRelationshipPeople({ ...input, call: async () => { failures++; throw new Error("test timeout"); } }), /test timeout/);
assert.equal(failures, 1, "generation failure must not trigger a hidden retry");
assert.equal((await generateRelationshipPeople({ ...input, existingNames: ["李老师"], call: async () => ({ text: JSON.stringify({ people: [row] }) }) })).length, 0);

let map = createEmptyRelationshipNetwork({ id: "map", ownerIdentityId: "owner", identityNodeId: "identity-node", now: 1 });
let npcs: RelationshipNetworkNpc[] = [];
let failMap = false;
const store = {
  maps: () => [map], npcs: () => npcs,
  saveNpc: (npc: RelationshipNetworkNpc) => { npcs.push(npc); return { success: true as const }; },
  removeNpc: (_owner: string, id: string) => { npcs = npcs.filter(npc => npc.id !== id); return { success: true as const }; },
  saveMap: (next: typeof map) => { if (failMap) return { success: false as const, error: "write" as const }; map = next; return { success: true as const }; },
};
const saveInput = { ownerIdentityId: "owner", map, characterId: "A", characterIds: ["A", "B"], selections: [{ person: generated[0] }] };
failMap = true;
assert.throws(() => saveGeneratedRelationshipPeople(saveInput, store), /关系保存失败/);
assert.equal(npcs.length, 0, "failed relation save rolls back only newly created NPCs");
failMap = false;
const saved = saveGeneratedRelationshipPeople(saveInput, store);
assert.equal(saved.added, 1); assert.equal(npcs.length, 1);
assert.equal(map.edges[0].forwardLabel, "导师"); assert.equal(map.edges[0].reverseLabel, "学生");
assert.equal(npcs[0].momentAutoMode, "manual", "confirmation must not opt into background API activity");
assert.equal(saveGeneratedRelationshipPeople(saveInput, store).added, 0, "confirmation reads latest map and does not duplicate saved people");
assert.equal(npcs.length, 1);
const existing = saveGeneratedRelationshipPeople({ ...saveInput, selections: [{ person: generated[0], target: "character:B" }] }, store);
assert.equal(existing.added, 1); assert.equal(npcs.length, 1, "existing character association never clones a character or NPC");
assert.equal(map.nodes.filter(node => node.entityType === "character" && node.entityId === "B").length, 1);
assert.throws(() => saveGeneratedRelationshipPeople({ ...saveInput, characterId: "unknown" }, store), /已失效/);
console.log("PASS one-click scoped extraction, no truncation/retry, evidence validation, confirmation-only persistence and rollback");
