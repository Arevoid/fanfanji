import { strict as assert } from "node:assert";
import { formatStructuralWorldBookSection } from "../src/features/chat/prompts/chatWorldBookPromptSections";
import { getOfflineStoriesContextForOnlineChat } from "../src/features/chat/prompts/onlineOfflineBoundary";
import { buildTextAiRuntimeConfig } from "../src/features/chat/services/textAiRuntimeConfig";
import { cleanAndExtractMoment, compactTopicHint, findMomentRelationshipCharacter, getMomentComments, getPostIntervalMs, getRelationshipLastMomentTimestamp } from "../src/features/moments/services/chatMomentUtils";
import type { Character, Moment, UserSettings } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";

const blocks = {
  after_main_prompt: ["甲", "乙"], before_char_def: [], after_char_def: [], before_chat_history: [], at_depth: [], allTriggered: [], formattedAll: "",
};
assert.equal(formatStructuralWorldBookSection(blocks, "after_main_prompt"), "[World Book Background: Main Prompt Extensions]\n甲\n\n乙");
assert.equal(formatStructuralWorldBookSection(blocks, "before_char_def"), "");
assert.equal(getOfflineStoriesContextForOnlineChat(), "");

const settings = { apiKey: "key", selectedModel: "model", apiEndpoint: "endpoint", apiTemperature: 0.4, streamCompatible: true } as UserSettings;
assert.deepEqual(buildTextAiRuntimeConfig(settings), { apiKey: "key", model: "model", apiEndpoint: "endpoint", apiTemperature: 0.4, streamCompatible: true });
assert.equal(buildTextAiRuntimeConfig({} as UserSettings).model, "gemini-3.5-flash");

const parsed = cleanAndExtractMoment("朋友圈：今天很好\n（配图：晚霞）\n（评论：补一句）");
assert.equal(parsed.content, "今天很好");
assert.equal(parsed.imageDescription, "晚霞");
assert.deepEqual(parsed.selfComments, ["补一句"]);
assert.equal(compactTopicHint(["[图片]|url  春天   出游", "美食"]).includes("url"), false);

const moment: Moment = { id: "m", characterId: "c", authorName: "角色", authorAvatar: "", content: "正文（自评：追加）", timestamp: 100, comments: [{ id: "deleted", authorName: "用户", authorAvatar: "", content: "删除", timestamp: 101 }], deletedCommentIds: ["deleted"], likes: [] };
assert.deepEqual(getMomentComments(moment).map((comment) => comment.content), ["追加"]);

const character = { id: "c", name: "角色", avatar: "", personality: "热爱分享", backstory: "" } as Character;
const relationship = { id: "r", characterId: "c", userIdentityId: "u", conversationId: "conv" } as CharacterRelationship;
assert.equal(getRelationshipLastMomentTimestamp([{ ...moment, relationId: "r", timestamp: 200 }, { ...moment, id: "other", relationId: "other", timestamp: 999 }], relationship, "c"), 200);
const oldRandom = Math.random;
Math.random = () => 0;
assert.equal(getPostIntervalMs(character), 24 * 60 * 60 * 1000);
Math.random = oldRandom;

const legacyContact = { ...character, id: "legacy-contact", isContactInstance: true, profileSourceId: character.id } as Character;
assert.equal(
  findMomentRelationshipCharacter([character, legacyContact], { ...relationship, characterId: legacyContact.id })?.id,
  character.id,
  "Moment posting and comments must resolve migrated contact relationships to the canonical character",
);

console.log("Chat module separation: 14 acceptance checks passed");
