import { readString, writeString } from "../../../core/storage/storageAdapter";
export type RelationshipView = "graph" | "cards";
const key = (identityId: string) => `phone_relationship_view_v1:${identityId}`;
export function readRelationshipView(identityId: string): RelationshipView {
  return readString(key(identityId)).value === "cards" ? "cards" : "graph";
}
export function saveRelationshipView(identityId: string, view: RelationshipView) {
  return writeString(key(identityId), view);
}
