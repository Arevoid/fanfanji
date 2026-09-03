import assert from "node:assert/strict";
import { createChatMessageDeliveryHandler, normalizeVoiceMarkup } from "../src/features/chat/services/chatMessageDelivery";
import type { Message } from "../src/types";

const message = (overrides: Partial<Message> = {}): Message => ({
  id: "m1", characterId: "c1", sender: "character", content: "hello", timestamp: 1, ...overrides,
});

{
  const source = message({ content: '[语音: "hi" (4秒)]' });
  assert.equal(normalizeVoiceMarkup(source.content), "[语音]|4|hi");
  const sent: Message[] = [];
  createChatMessageDeliveryHandler({
    settings: { enableMiniMaxTts: false } as never,
    activeCharacter: { id: "c1", isGroupChat: false } as never,
    activeDirectScope: { relationId: "r1", characterId: "c1", conversationId: "direct:r1", userIdentityId: "i1" },
    activeAttachModal: null,
    callingStatus: null,
    onSendMessageRaw: (next) => sent.push(next),
    setCallTranscript: () => undefined,
    enqueueCallSpeech: async () => undefined,
  })(source);
  assert.equal(source.content, '[语音: "hi" (4秒)]');
  assert.equal(sent[0].content, "[语音]|4|hi");
}

{
  const transcripts: Array<{ id: string; sender: Message["sender"]; content: string; timestamp: number }> = [];
  const handler = createChatMessageDeliveryHandler({
    settings: { enableMiniMaxTts: false } as never,
    activeCharacter: { id: "c1", isGroupChat: false } as never,
    activeDirectScope: { relationId: "r1", characterId: "c1", conversationId: "direct:r1", userIdentityId: "i1" },
    activeAttachModal: "calling",
    callingStatus: "connected",
    onSendMessageRaw: () => { throw new Error("call subtitle leaked to timeline"); },
    setCallTranscript: (next) => transcripts.push(...next([])),
    enqueueCallSpeech: async () => undefined,
  });
  handler(message({ content: "hello" }));
  assert.deepEqual(transcripts, [{ id: "m1", content: "hello", sender: "character", timestamp: 1 }]);
}

{
  const sent: Message[] = [];
  createChatMessageDeliveryHandler({
    settings: {} as never,
    activeCharacter: { id: "group-1", isGroupChat: true } as never,
    activeDirectScope: null,
    activeAttachModal: null,
    callingStatus: null,
    onSendMessageRaw: (next) => sent.push(next),
    setCallTranscript: () => undefined,
    enqueueCallSpeech: async () => undefined,
  })(message({ relationId: "old-relation" }));
  assert.equal(sent[0].conversationId, "group:group-1");

  createChatMessageDeliveryHandler({
    settings: {} as never,
    activeCharacter: { id: "c1", isGroupChat: false } as never,
    activeDirectScope: undefined,
    activeAttachModal: null,
    callingStatus: null,
    onSendMessageRaw: () => { throw new Error("unscoped direct message leaked"); },
    setCallTranscript: () => undefined,
    enqueueCallSpeech: async () => undefined,
  })(message());
}

console.log("PASS chat message delivery keeps voice normalization, call transcript, and scope boundaries isolated");
