import { createId } from "../../../core/id/createId";
import { listRelationshipNetworkMapsForIdentity, listRelationshipNetworkNpcsForIdentity, upsertRelationshipNetworkNpc, removeRelationshipNetworkNpc, upsertRelationshipNetworkMap } from "../../../core/storage/repositories/relationshipNetworkRepository";
import { createRelationshipNetworkNpc } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import type { RelationshipNetworkMap, RelationshipNetworkNpc, RelationshipNetworkNode } from "../../../domain/relationshipNetwork/relationshipNetworkTypes";
import type { GeneratedRelationshipPerson } from "./generateRelationshipPeople";
import { personNameKey } from "./generateRelationshipPeople";
import { relationshipNeighbors } from "../../../domain/relationshipNetwork/relationshipPeople";

export interface RelationshipPersonSelection { person: GeneratedRelationshipPerson; target?: string }
export const relationshipPeopleStore = {
  maps: listRelationshipNetworkMapsForIdentity, npcs: listRelationshipNetworkNpcsForIdentity,
  saveNpc: upsertRelationshipNetworkNpc, removeNpc: removeRelationshipNetworkNpc, saveMap: upsertRelationshipNetworkMap,
};
/** No writes occur before confirmation. Always merge into the latest map. */
export function saveGeneratedRelationshipPeople(input: {
  ownerIdentityId: string; map: RelationshipNetworkMap; characterId: string;
  characterIds: readonly string[]; selections: readonly RelationshipPersonSelection[];
}, store = relationshipPeopleStore) {
  if (!input.characterIds.includes(input.characterId) || input.map.ownerIdentityId !== input.ownerIdentityId) throw new Error("中心角色或身份已失效，未添加人物。");
  const latest = store.maps(input.ownerIdentityId).find(map => map.id === input.map.id) || input.map;
  const map = { ...latest, nodes: [...latest.nodes], edges: [...latest.edges], updatedAt: Date.now() };
  const existingNpcs = store.npcs(input.ownerIdentityId);
  const connectedNames = new Set(relationshipNeighbors(map, input.characterId).filter(item => item.node.entityType === "npc")
    .map(item => existingNpcs.find(npc => npc.id === item.node.entityId)?.name).filter((name): name is string => !!name).map(personNameKey));
  const inserted: RelationshipNetworkNpc[] = [];
  const ensureNode = (entityType: "character" | "npc", entityId: string): RelationshipNetworkNode => {
    const old = map.nodes.find(node => node.entityType === entityType && node.entityId === entityId);
    if (old) return old;
    const index = map.nodes.length;
    const node = { id: createId("relationship-network-node"), entityType, entityId, x: 60 + (index % 5) * 210, y: 100 + Math.floor(index / 5) * 130 };
    map.nodes.push(node); return node;
  };
  const source = ensureNode("character", input.characterId);
  let added = 0;
  try {
    for (const { person, target } of input.selections) {
      let type: "npc" | "character" = "npc";
      let id: string;
      if (target?.startsWith("character:")) {
        type = "character"; id = target.slice(10);
        if (!input.characterIds.includes(id) || id === input.characterId) throw new Error("关联角色已失效，未保存本次结果。");
      } else if (target?.startsWith("npc:")) {
        id = target.slice(4);
        if (!existingNpcs.some(npc => npc.id === id)) throw new Error("关联 NPC 已失效，未保存本次结果。");
      } else {
        if (connectedNames.has(personNameKey(person.name))) continue;
        id = createId("relationship-network-npc");
        const npc = { ...createRelationshipNetworkNpc({ id, ownerIdentityId: input.ownerIdentityId, name: person.name,
          summary: person.summary, role: person.role, personality: person.personality, momentAutoMode: "manual", now: Date.now() }), gender: person.gender, age: person.age };
        if (!store.saveNpc(npc).success) throw new Error("NPC 保存失败，请检查存储空间。");
        inserted.push(npc); connectedNames.add(personNameKey(person.name));
      }
      const destination = ensureNode(type, id);
      if (map.edges.some(edge => (edge.sourceNodeId === source.id && edge.targetNodeId === destination.id) || (edge.targetNodeId === source.id && edge.sourceNodeId === destination.id))) continue;
      map.edges.push({ id: createId("relationship-network-edge"), sourceNodeId: source.id, targetNodeId: destination.id,
        direction: "both", forwardLabel: person.relationship, reverseLabel: person.reverseRelationship,
        note: person.evidence, createdAt: Date.now(), updatedAt: Date.now() });
      added++;
    }
    if (!store.saveMap(map).success) throw new Error("关系保存失败，本次新增 NPC 将撤销；可保留草稿后重试。");
    return { map, npcs: store.npcs(input.ownerIdentityId), added };
  } catch (error) {
    let rollbackFailed = false;
    for (const npc of inserted) if (!store.removeNpc(input.ownerIdentityId, npc.id).success) rollbackFailed = true;
    if (rollbackFailed) throw new Error("保存未完成，部分新建 NPC 尚未关联；请在原有 NPC 列表查看，避免重复添加。");
    throw error;
  }
}
