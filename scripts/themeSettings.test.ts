import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const backupActions = readFileSync(new URL("../src/features/settings/hooks/useSystemBackupActions.ts", import.meta.url), "utf8");
assert.match(settings, /data-settings-shell/);
assert.match(backupActions, /外观设置/);
assert.match(settings, /phone_appearance_settings/);
assert.match(backupActions, /notifyAppearanceSettingsChanged/);
for (const file of ["Input.tsx", "Textarea.tsx", "Button.tsx", "IconButton.tsx", "Modal.tsx", "BottomSheet.tsx", "PopoverMenu.tsx", "AppHeader.tsx"]) {
  const source = readFileSync(new URL(`../src/components/ui/${file}`, import.meta.url), "utf8");
  assert.match(source, /var\(--/);
}
const confirmDialog = readFileSync(new URL("../src/components/ui/ConfirmDialog.tsx", import.meta.url), "utf8");
assert.match(confirmDialog, /<Modal/);
console.log("PASS settings and shared UI use theme tokens");
