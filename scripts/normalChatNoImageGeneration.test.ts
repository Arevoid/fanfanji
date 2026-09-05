import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/features/chat/hooks/useChatController.ts", import.meta.url), "utf8");
const normalReplyStart = source.indexOf("const generateResponseForUserMessage");
const normalReplyEnd = source.indexOf("const sendCustomMessage", normalReplyStart);
assert.ok(normalReplyStart >= 0 && normalReplyEnd > normalReplyStart, "normal reply function must be present");
assert.doesNotMatch(source.slice(normalReplyStart, normalReplyEnd), /generateCharacterImage/);
assert.match(controller, /shouldGenerateExplicitImage[\s\S]{0,220}generateAndSendCharacterImage/);
console.log("normalChatNoImageGeneration.test passed");
