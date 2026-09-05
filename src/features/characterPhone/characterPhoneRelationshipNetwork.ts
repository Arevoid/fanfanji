import type { Character } from "../../types";
import type {
  RelationshipNetworkEdge,
  RelationshipNetworkMap,
  RelationshipNetworkNpc,
  RelationshipNetworkNode,
} from "../../domain/relationshipNetwork/relationshipNetworkTypes";

/**
 * The role phone is a projection of the active identity's relationship graph.
 * Keep the graph lookup separate from storage so the projection is deterministic
 * and easy to exercise in unit tests.
 */
export interface CharacterPhoneRelationshipNetworkContact {
  npc: RelationshipNetworkNpc;
  relationLabels: string[];
  linkedCharacterId?: string;
}

function edgeLabel(edge: RelationshipNetworkEdge, roleIsSource: boolean): string | undefined {
  const directionalLabel = roleIsSource
    ? edge.direction === "reverse" ? edge.reverseLabel : edge.forwardLabel
    : edge.direction === "reverse" ? edge.forwardLabel : edge.reverseLabel;
  const labels = [directionalLabel, edge.forwardLabel, edge.reverseLabel, edge.category, edge.note];
  return labels.find((value) => Boolean(value?.trim()))?.trim();
}

function findNode(map: RelationshipNetworkMap, nodeId: string): RelationshipNetworkNode | undefined {
  return map.nodes.find((node) => node.id === nodeId);
}

function collectConnectedNpcIds(
  character: Character,
  ownerIdentityId: string,
  maps: readonly RelationshipNetworkMap[],
): Map<string, string[]> {
  const labelsByNpcId = new Map<string, string[]>();
  maps
    .filter((map) => map.ownerIdentityId === ownerIdentityId)
    .forEach((map) => {
      const roleNodeIds = new Set(
        map.nodes
          .filter((node) => node.entityType === "character" && node.entityId === character.id)
          .map((node) => node.id),
      );
      if (roleNodeIds.size === 0) return;
      map.edges.forEach((edge) => {
        const source = findNode(map, edge.sourceNodeId);
        const target = findNode(map, edge.targetNodeId);
        if (!source || !target) return;
        let npcNode: RelationshipNetworkNode | undefined;
        let roleIsSource = false;
        if (roleNodeIds.has(source.id) && target.entityType === "npc") {
          npcNode = target;
          roleIsSource = true;
        } else if (roleNodeIds.has(target.id) && source.entityType === "npc") {
          npcNode = source;
          roleIsSource = false;
        }
        if (!npcNode) return;
        const labels = labelsByNpcId.get(npcNode.entityId) || [];
        const label = edgeLabel(edge, roleIsSource);
        if (label && !labels.includes(label)) labels.push(label);
        labelsByNpcId.set(npcNode.entityId, labels);
      });
    });
  return labelsByNpcId;
}

export function listCharacterPhoneRelationshipNetworkContacts(input: {
  character: Character;
  ownerIdentityId: string;
  characters: readonly Character[];
  npcs: readonly RelationshipNetworkNpc[];
  maps: readonly RelationshipNetworkMap[];
}): CharacterPhoneRelationshipNetworkContact[] {
  const labelsByNpcId = collectConnectedNpcIds(input.character, input.ownerIdentityId, input.maps);
  const linkedCharacterByNpcId = new Map(
    input.characters
      .filter((candidate) => (candidate.ownerIdentityId || "identity-1") === input.ownerIdentityId)
      .filter((candidate) => Boolean(candidate.relationshipNetworkNpcId))
      .map((candidate) => [candidate.relationshipNetworkNpcId!, candidate.id]),
  );
  return input.npcs
    .filter((npc) => npc.ownerIdentityId === input.ownerIdentityId && labelsByNpcId.has(npc.id))
    .map((npc) => ({
      npc,
      relationLabels: labelsByNpcId.get(npc.id) || [],
      linkedCharacterId: linkedCharacterByNpcId.get(npc.id) || npc.linkedCharacterId,
    }));
}
