import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Character, OfflineStory } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import { resolveOfflineChatNavigationTarget } from "../src/domain/relationship/offlineChatNavigation";

const character = {
  id: "character-a",
  name: "角色 A",
  avatar: "",
  personality: "",
  backstory: "",
} as Character;
const group = {
  ...character,
  id: "group-a",
  name: "群聊 A",
  isGroupChat: true,
} as Character;
const relationshipA: CharacterRelationship = {
  id: "relation-a",
  characterId: character.id,
  userIdentityId: "identity-a",
  conversationId: "direct:relation-a",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
};
const relationshipB: CharacterRelationship = {
  ...relationshipA,
  id: "relation-b",
  userIdentityId: "identity-b",
  conversationId: "direct:relation-b",
};
const story = {
  id: "story-a",
  characterId: character.id,
  relationId: relationshipA.id,
  conversationId: relationshipA.conversationId,
  title: "关联线上聊天的长标题",
  createdAt: 1,
  updatedAt: 1,
  mode: "continue",
  sourceChatId: character.id,
  sourceChatMsgCount: 25,
  messages: [],
} satisfies OfflineStory;

assert.deepEqual(resolveOfflineChatNavigationTarget({
  story,
  relationships: [relationshipA, relationshipB],
  characters: [character, group],
  ownerIdentityId: "identity-a",
}), {
  characterId: character.id,
  relationId: relationshipA.id,
  conversationId: relationshipA.conversationId,
  kind: "direct",
});
assert.equal(resolveOfflineChatNavigationTarget({
  story,
  relationships: [relationshipA, relationshipB],
  characters: [character, group],
  ownerIdentityId: "identity-b",
}), null, "another identity must not follow the linked relation");

const secondIdentityStory = {
  ...story,
  id: "story-b",
  relationId: relationshipB.id,
  conversationId: relationshipB.conversationId,
};
assert.equal(resolveOfflineChatNavigationTarget({
  story: secondIdentityStory,
  relationships: [relationshipA, relationshipB],
  characters: [character, group],
  ownerIdentityId: "identity-b",
})?.relationId, relationshipB.id);

const legacyTarget = resolveOfflineChatNavigationTarget({
  story: { ...story, id: "legacy", relationId: undefined, conversationId: undefined },
  relationships: [relationshipA, relationshipB],
  characters: [character, group],
  ownerIdentityId: "identity-b",
});
assert.equal(legacyTarget?.relationId, relationshipB.id);
assert.equal(legacyTarget?.conversationId, relationshipB.conversationId);

assert.deepEqual(resolveOfflineChatNavigationTarget({
  story: {
    ...story,
    id: "group-story",
    characterId: group.id,
    sourceChatId: group.id,
    relationId: undefined,
    conversationId: "group:group-a",
  },
  relationships: [relationshipA, relationshipB],
  characters: [character, group],
  ownerIdentityId: "identity-a",
}), {
  characterId: group.id,
  conversationId: "group:group-a",
  kind: "group",
});

const componentSource = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const workspaceExitSource = readFileSync(new URL("../src/features/offline/hooks/useOfflineWorkspaceExitActions.ts", import.meta.url), "utf8");
const workspaceHeaderSource = readFileSync(new URL("../src/features/offline/components/OfflineWorkspaceHeader.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../src/components/offline/offlineStory.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const workspaceHeaderStart = workspaceHeaderSource.indexOf('<header className={`offline-workspace-header');
const workspaceHeaderEnd = workspaceHeaderSource.indexOf("</header>", workspaceHeaderStart);
const linkedStatusStart = componentSource.indexOf('className="offline-chat-link-card"', workspaceHeaderStart);

assert.ok(workspaceHeaderStart >= 0 && workspaceHeaderEnd > workspaceHeaderStart);
assert.ok(linkedStatusStart > workspaceHeaderEnd, "linked status must render outside the navigation header");
assert.match(workspaceHeaderSource.slice(workspaceHeaderStart, workspaceHeaderEnd), /aria-label="返回线下故事列表"/);
assert.match(workspaceHeaderSource.slice(workspaceHeaderStart, workspaceHeaderEnd), /offline-workspace-menu-anchor/);
assert.match(workspaceExitSource, /onNavigateToChat\(target\.characterId, target\.relationId, target\.conversationId\)/);
assert.match(cssSource, /\.offline-workspace-nav\s*\{[\s\S]*grid-template-columns:\s*40px minmax\(0, 1fr\) 40px/);
assert.match(cssSource, /\.offline-chat-link-copy\s*\{[\s\S]*min-width:\s*0/);
assert.match(cssSource, /\.offline-chat-link-action\s*\{[\s\S]*flex:\s*0 0 auto/);
assert.match(appSource, /candidate\.userIdentityId === ownerIdentityId/);
assert.match(appSource, /conversationId !== \(relationship\.conversationId \|\| getConversationId\(relationship\.id\)\)/);

console.log("PASS offline navigation slots, linked status separation, and relation-aware chat return");
