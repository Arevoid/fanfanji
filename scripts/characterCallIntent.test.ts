import assert from "node:assert/strict";
import { resolveCharacterCallIntent } from "../src/features/chat/services/characterCallIntent";

const character = (content: string) => ({
  id: content,
  characterId: "character-a",
  sender: "character" as const,
  content,
  timestamp: 1,
});

assert.equal(resolveCharacterCallIntent([character("我已经给你打过去了，赶紧接。")]), "voice");
assert.equal(resolveCharacterCallIntent([character("等我擦一下手，马上给你拨过去。")]), "voice");
assert.equal(resolveCharacterCallIntent([character("视频通话打过来了，接一下。")]), "video");
assert.equal(resolveCharacterCallIntent([character("等会儿有空再说。")]), undefined);
assert.equal(resolveCharacterCallIntent([{ ...character("我已经给你打过去了"), sender: "user" as const }]), undefined);

console.log("PASS character call completion text can open the real incoming-call UI");
