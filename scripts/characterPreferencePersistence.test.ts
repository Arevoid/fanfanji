import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const archives = readFileSync(new URL("../src/components/AppArchives.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const saveSettings = readFileSync(new URL("../src/features/chat/hooks/useChatSaveSettings.ts", import.meta.url), "utf8");
const sideEffects = readFileSync(new URL("../src/features/chat/controllers/chatSideEffectController.ts", import.meta.url), "utf8");

// Editing a profile must preserve all non-form character settings, including
// the chat preference toggles added after the archive form was written.
assert.match(archives, /\.\.\.\(originalChar \|\| \{\}\)/);

// Full saves merge against the latest character record, while delayed effects
// update only the field they own.
assert.match(app, /const charactersRef = useRef<Character\[\]>\(characters\)/);
assert.match(app, /const charactersRepositoryHydrated = useRef\(false\)/);
assert.match(app, /if \(!charactersRepositoryHydrated\.current\) return;/);
assert.match(app, /const savedCharacter = existingCharacter \? \{ \.\.\.existingCharacter, \.\.\.char \} : char/);
assert.match(app, /const handleUpdateCharacter = async/);
assert.match(sideEffects, /updateCharacter\?: \(characterId: string, patch: Partial<Character>\)/);
assert.match(sideEffects, /dependencies\.updateCharacter\(input\.activeCharacter\.id, \{ momentsCover: selectedCover \}\)/);

// The settings page now waits for the durable write and can report failure.
assert.match(saveSettings, /const persisted = await onSaveCharacter\(/);
assert.match(saveSettings, /if \(persisted === false\) return false/);
assert.match(chat, /const saveSettingsWithFeedback = async/);
assert.match(chat, /设置保存失败，请检查浏览器存储空间后重试/);

console.log("PASS character preference persistence regression checks");
