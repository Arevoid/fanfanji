import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const momentsApp = readFileSync(new URL("../src/features/moments/MomentsApp.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatMomentActions.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatMomentActions/);
assert.match(appChat, /handleMomentCommentClick/);
assert.doesNotMatch(appChat, /const handleFavoriteMoment =/);
assert.doesNotMatch(appChat, /const handleTranslateMoment = async/);
assert.match(hook, /setPointerCapture/);
assert.match(hook, /suppressCommentClickRef/);
assert.match(hook, /navigator\.clipboard\.writeText/);
assert.match(hook, /apiTranslate/);
assert.match(hook, /setMomentFavorites/);
assert.match(hook, /onDeleteCommentFromMoment/);
assert.match(hook, /onDeleteMoment/);
assert.match(momentsApp, /moment-media-placeholder/);
assert.match(momentsApp, /momentContextText/);
assert.match(appChat, /const momentContextText = renderMomentContent\(mom\.content\) \|\| textImageDescription/);
assert.match(appChat, /onContextMenu=\{\(event\) => handleMomentTextContextMenu\(event, mom\.id, momentContextText/);

console.log("chat Moment actions hook contract passed");
