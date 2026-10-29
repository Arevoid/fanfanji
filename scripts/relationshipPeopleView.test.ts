import assert from "node:assert/strict";
import { relationshipNeighbors, relationshipCharacterGraph } from "../src/domain/relationshipNetwork/relationshipPeople";
import { createEmptyRelationshipNetwork } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";
const map = createEmptyRelationshipNetwork({ id: "map", ownerIdentityId: "identity", identityNodeId: "self", now: 1 });
map.nodes = ["A", "B", "C"].map(id => ({ id, entityId: id, entityType: "character", x: 0, y: 0 }));
map.edges = [
  { id: "ab", sourceNodeId: "A", targetNodeId: "B", direction: "both", forwardLabel: "导师", reverseLabel: "学生", createdAt: 1, updatedAt: 1 },
  { id: "ab2", sourceNodeId: "B", targetNodeId: "A", direction: "both", forwardLabel: "同事", reverseLabel: "同事", createdAt: 1, updatedAt: 1 },
  { id: "bc", sourceNodeId: "B", targetNodeId: "C", direction: "forward", forwardLabel: "邻居", createdAt: 1, updatedAt: 1 },
];
assert.equal(relationshipNeighbors(map, "A").length, 1, "count distinct direct people, not edges or transitive neighbors");
assert.deepEqual(relationshipNeighbors(map, "A")[0].labels, ["导师", "同事"]);
assert.deepEqual(relationshipNeighbors(map, "B")[0].labels, ["学生", "同事"]);
assert.equal(relationshipNeighbors(map, "absent").length, 0);
const aGraph = relationshipCharacterGraph(map, "A");
assert.deepEqual(aGraph.nodes.map(node => node.id), ["A", "B"]);
assert.deepEqual(aGraph.edges.map(edge => edge.id), ["ab", "ab2"]);
assert.deepEqual(relationshipCharacterGraph(map, "C").nodes.map(node => node.id), ["B", "C"]);
assert.equal(relationshipCharacterGraph(map, "absent").nodes.length, 0);
assert.equal(map.nodes.length, 3, "view switching never removes persisted people");
assert.equal(map.edges.length, 3, "view switching never removes other relationships");
console.log("PASS direct-neighbor cards deduplicate people and preserve relationship direction");
