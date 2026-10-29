import type { RelationshipNetworkMap, RelationshipNetworkEdge } from "./relationshipNetworkTypes";

/** A view projection only: never removes other people's persisted nodes or edges. */
export function relationshipCharacterGraph(map: RelationshipNetworkMap, characterId?: string): RelationshipNetworkMap {
  const center = map.nodes.find(node => node.entityType === "character" && node.entityId === characterId);
  const edges = center ? map.edges.filter(edge => edge.sourceNodeId === center.id || edge.targetNodeId === center.id) : [];
  const ids = new Set(center ? [center.id] : []);
  edges.forEach(edge => { ids.add(edge.sourceNodeId); ids.add(edge.targetNodeId); });
  return { ...map, nodes: map.nodes.filter(node => ids.has(node.id)), edges };
}

/** Direct neighbors only. A person appears once even if several edges exist. */
export function relationshipNeighbors(map: RelationshipNetworkMap, characterId: string) {
  const center = map.nodes.find(node => node.entityType === "character" && node.entityId === characterId);
  if (!center) return [];
  const neighbors = new Map<string, { node: typeof center; edges: RelationshipNetworkEdge[]; labels: string[] }>();
  for (const edge of map.edges) {
    const forward = edge.sourceNodeId === center.id;
    if (!forward && edge.targetNodeId !== center.id) continue;
    const node = map.nodes.find(item => item.id === (forward ? edge.targetNodeId : edge.sourceNodeId));
    if (!node || node.id === center.id) continue;
    const key = `${node.entityType}:${node.entityId}`;
    const item = neighbors.get(key) || { node, edges: [], labels: [] };
    item.edges.push(edge);
    const label = forward ? edge.forwardLabel : edge.reverseLabel;
    if (label && !item.labels.includes(label)) item.labels.push(label);
    neighbors.set(key, item);
  }
  return [...neighbors.values()];
}
