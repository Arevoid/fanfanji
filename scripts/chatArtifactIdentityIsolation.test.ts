import assert from "node:assert/strict";
import type { Message } from "../src/types";
import { attachDirectScope, isMessageInDirectScope, messageMatchesMutationScope, resolveDirectInteractionScope } from "../src/features/chat/context/directInteractionScope";
import { createRelationship } from "../src/domain/relationship/characterRelationship";

const relationA = createRelationship({ id: "rel-a", characterId: "char", userIdentityId: "identity-a", now: 1 });
const relationB = createRelationship({ id: "rel-b", characterId: "char", userIdentityId: "identity-b", now: 1 });
const scopeA = resolveDirectInteractionScope({ characterId: "char", activeIdentityId: "identity-a", relationship: relationA, isGroupChat: false });
assert.ok(scopeA);
assert.equal(resolveDirectInteractionScope({ characterId: "char", activeIdentityId: "identity-b", relationship: relationA, isGroupChat: false }), undefined);
assert.equal(resolveDirectInteractionScope({ characterId: "other", activeIdentityId: "identity-a", relationship: relationA, isGroupChat: false }), undefined);

const unscoped: Message = { id: "same-id", characterId: "char", sender: "user", content: "A", timestamp: 1 };
const messageA = attachDirectScope(unscoped, scopeA!);
assert.ok(messageA && isMessageInDirectScope(messageA, scopeA!));
assert.equal(attachDirectScope({ ...unscoped, relationId: relationB.id }, scopeA!), undefined, "foreign pre-scoped writes are rejected");

const messageB: Message = { ...messageA!, relationId: relationB.id, conversationId: relationB.conversationId, content: "B" };
const mutated = [messageA!, messageB].map((message) => message.id === messageA!.id && messageMatchesMutationScope(message, messageA!)
  ? { ...message, isBookmarked: true }
  : message);
assert.equal(mutated[0].isBookmarked, true);
assert.equal(mutated[1].isBookmarked, undefined, "same messageId in another relationship is not mutated");

console.log("chat artifact identity isolation tests passed");
