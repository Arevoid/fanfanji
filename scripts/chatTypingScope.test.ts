import assert from "node:assert/strict";
import { createChatRuntimeContext } from "../src/features/chat/context/chatRuntimeContext";
import {
  getChatTypingScopeKey,
  getVisibleChatTyping,
  setChatScopeCharacterOverride,
  setChatScopeTyping,
  type ChatTypingScopeState,
} from "../src/features/chat/services/chatTypingScope";

type TestCharacter = { id: string; name: string };

const scopeA = getChatTypingScopeKey(createChatRuntimeContext({
  characterId: "character-a",
  relationId: "relation-a",
  conversationId: "conversation-a",
  userIdentityId: "identity-1",
}));
const scopeB = getChatTypingScopeKey(createChatRuntimeContext({
  characterId: "character-b",
  relationId: "relation-b",
  conversationId: "conversation-b",
  userIdentityId: "identity-1",
}));

let state: ChatTypingScopeState<TestCharacter> = {};
state = setChatScopeTyping(state, scopeA, true);
assert.equal(getVisibleChatTyping(state, scopeA)?.isTyping, true);
assert.equal(getVisibleChatTyping(state, scopeB), null, "A replying must not make B appear to type");

state = setChatScopeCharacterOverride(state, scopeA, { id: "character-a", name: "A" });
assert.equal(getVisibleChatTyping(state, scopeA)?.characterOverride?.id, "character-a");
assert.equal(getVisibleChatTyping(state, scopeB), null, "A's typing avatar must not leak into B");

state = setChatScopeTyping(state, scopeB, true);
assert.equal(getVisibleChatTyping(state, scopeB)?.isTyping, true);
state = setChatScopeTyping(state, scopeA, false);
assert.equal(getVisibleChatTyping(state, scopeB)?.isTyping, true, "A finishing must not clear B's own typing state");
state = setChatScopeTyping(state, scopeB, false);
assert.equal(getVisibleChatTyping(state, scopeB), null);

console.log("chat typing scope tests passed");
