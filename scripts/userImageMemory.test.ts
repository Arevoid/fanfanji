import assert from "node:assert/strict";
import { CHARACTER_SAVE_USER_IMAGE_DIRECTIVE, parseCharacterSaveUserImageDirective } from "../src/features/chat/services/userImageMemoryService";

const parsed = parseCharacterSaveUserImageDirective(`这张很好看。\n${CHARACTER_SAVE_USER_IMAGE_DIRECTIVE}`);
assert.equal(parsed.shouldSave, true);
assert.equal(parsed.visibleText, "这张很好看。");

const notSaved = parseCharacterSaveUserImageDirective("这张先不存。嗯。");
assert.equal(notSaved.shouldSave, false);
assert.equal(notSaved.visibleText, "这张先不存。嗯。");

console.log("userImageMemory.test passed");
