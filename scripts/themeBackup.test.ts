import assert from "node:assert/strict";
import { sanitizeSystemBackupValue } from "../src/components/AppSettings";

assert.equal(sanitizeSystemBackupValue("phone_appearance_settings", JSON.stringify({ themeMode: "dark" })), JSON.stringify({ themeMode: "dark" }));
assert.equal(sanitizeSystemBackupValue("phone_appearance_settings", "broken"), JSON.stringify({ themeMode: "light" }));
assert.equal(sanitizeSystemBackupValue("phone_appearance_settings", JSON.stringify({ themeMode: "nope" })), JSON.stringify({ themeMode: "light" }));
console.log("PASS appearance backup sanitizer");
