import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appOffline = fs.readFileSync(path.join(root, "src/components/AppOffline.tsx"), "utf8");
const appSettings = fs.readFileSync(path.join(root, "src/components/AppSettings.tsx"), "utf8");
const editor = fs.readFileSync(path.join(root, "src/features/offline/hooks/useOfflineMessageEditorState.ts"), "utf8");
const icons = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsChatIconState.ts"), "utf8");
const backupUi = fs.readFileSync(path.join(root, "src/features/settings/hooks/useSettingsBackupUiState.ts"), "utf8");

assert.match(editor, /editingMessageId/);
assert.match(icons, /sanitizeChatIcons/);
assert.match(backupUi, /lastBackupAt/);
assert.match(backupUi, /isClearingApplicationData/);
assert.match(appOffline, /useOfflineMessageEditorState/);
assert.match(appSettings, /useSettingsChatIconState/);
assert.match(appSettings, /useSettingsBackupUiState/);
assert.doesNotMatch(appOffline, /const \[editingMessageId, setEditingMessageId\] = useState/);
assert.doesNotMatch(appSettings, /const \[showBackupExportOptions, setShowBackupExportOptions\] = useState/);

console.log("remaining UI state hook contracts passed");
