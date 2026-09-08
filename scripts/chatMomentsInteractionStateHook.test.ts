import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hook = fs.readFileSync(path.join(root, "src/features/chat/hooks/useChatMomentsInteractionState.ts"), "utf8");
const appChat = fs.readFileSync(path.join(root, "src/components/AppChat.tsx"), "utf8");

assert.match(hook, /phone_moment_translations/);
assert.match(hook, /phone_moment_favorites/);
assert.match(hook, /phone_last_viewed_moments_time/);
assert.match(hook, /commentContextMenu/);
assert.match(appChat, /useChatMomentsInteractionState/);
assert.doesNotMatch(appChat, /const \[momentFavorites, setMomentFavorites\] = useState/);
assert.doesNotMatch(appChat, /const \[momentTranslations, setMomentTranslations\] = useState/);

console.log("chat moments interaction state hook contract passed");
