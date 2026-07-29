import assert from "node:assert/strict";
import { resolveTheme, sanitizeAppearanceSettings, subscribeToSystemTheme } from "../src/features/theme/theme";

assert.deepEqual(sanitizeAppearanceSettings(undefined), { themeMode: "light" });
assert.deepEqual(sanitizeAppearanceSettings({ themeMode: "invalid" }), { themeMode: "light" });
assert.deepEqual(sanitizeAppearanceSettings({ themeMode: "dark", extra: true }), { themeMode: "dark" });
assert.equal(resolveTheme("light", true), "light");
assert.equal(resolveTheme("dark", false), "dark");
assert.equal(resolveTheme("system", false), "light");
assert.equal(resolveTheme("system", true), "dark");

let listener: ((event: { matches: boolean }) => void) | undefined;
let removed = false;
const query = {
  matches: false,
  addEventListener: (_type: "change", next: (event: { matches: boolean }) => void) => { listener = next; },
  removeEventListener: () => { removed = true; },
};
const values: boolean[] = [];
const unsubscribe = subscribeToSystemTheme(query, (matches) => values.push(matches));
listener?.({ matches: true });
unsubscribe();
assert.deepEqual(values, [true]);
assert.equal(removed, true);
console.log("PASS theme resolution and system listener lifecycle");
