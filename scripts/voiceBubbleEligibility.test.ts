import { shouldConvertBubbleToVoice } from "../src/features/chat/services/voiceBubbleEligibility";
import type { Character, Message } from "../src/types";
import type { ChatRuntimeContext } from "../src/features/chat/context/chatRuntimeContext";

const character = { id: "c1", name: "小凡", voiceFrequency: "high", personality: "", backstory: "" } as Character;
const message = (content: string): Message => ({ id: "m1", sender: "user", content, timestamp: 1, characterId: "c1", relationId: "r1", conversationId: "conv-1" } as Message);
const context = { characterId: "c1", relationId: "r1", conversationId: "conv-1", userIdentityId: "u1", isGroup: false } as ChatRuntimeContext;

if (shouldConvertBubbleToVoice({ enabled: false, character, lastUserMessage: message("声音"), recentMessages: [], bubbleIndex: 0, bubbleText: "你好", replyContext: context })) {
  throw new Error("disabled TTS must not convert a bubble");
}
if (!shouldConvertBubbleToVoice({ enabled: true, character, lastUserMessage: message("给我发条语音吧"), recentMessages: [], bubbleIndex: 0, bubbleText: "你好", replyContext: context })) {
  throw new Error("explicit voice request should convert the first bubble");
}
if (shouldConvertBubbleToVoice({ enabled: true, character, lastUserMessage: message("给我发条语音吧"), recentMessages: [], bubbleIndex: 1, bubbleText: "你好", replyContext: context })) {
  throw new Error("only the first generated bubble should be eligible");
}
