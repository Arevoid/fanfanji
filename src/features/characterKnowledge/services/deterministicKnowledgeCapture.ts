import type { Message } from "../../../types";
import type { CharacterTruthScope, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { evaluateKnowledgeWrite } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { parseCallRecord } from "../../chat/services/messageParser";

function describeDeterministicArtifact(message: Message): string | undefined {
  const actor = message.sender === "user" ? "用户" : "角色";
  const parts = message.content.split("|");
  if (message.content.startsWith("[红包]")) return `${actor}在聊天中发送了金额为 ${parts[1] || "未知"} 元的红包。`;
  if (message.content.startsWith("[转账]")) return `${actor}在聊天中发起了金额为 ${parts[1] || "未知"} 元的转账。`;
  if (message.content.startsWith("[音乐]")) return `${actor}在聊天中分享了音乐《${parts[1] || "未知曲目"}》。`;
  if (message.content.startsWith("[通话记录]")) {
    const call = parseCallRecord(message.content);
    return call.status === "completed" ? `双方完成了一次${call.callType || "语音"}通话，记录时长为 ${call.duration || "未知"}。` : undefined;
  }
  if (message.content.startsWith("[位置]")) return `${actor}在聊天中分享了位置“${parts[1] || "未命名位置"}”；这不表示其本人实际位于该处。`;
  if (message.content.startsWith("[文件]")) return `${actor}在聊天中分享了文件《${parts[1] || "未命名文件"}》。`;
  if (message.content.startsWith("[语音]|")) return `${actor}在聊天中发送了一条语音消息。`;
  return undefined;
}
export function createDeterministicArtifactClaim(input: {
  message: Message;
  scope: CharacterTruthScope;
}): KnowledgeClaim | undefined {
  const statement = describeDeterministicArtifact(input.message);
  if (!statement
    || input.message.relationId !== input.scope.relationId
    || input.message.characterId !== input.scope.characterId
    || input.message.conversationId !== input.scope.conversationId) return undefined;
  const decision = evaluateKnowledgeWrite({
    id: `claim:action:${input.scope.relationId}:${input.message.id}`,
    ...input.scope,
    kind: "fact",
    subject: "relationship",
    statement,
    temporalStatus: "past",
    source: {
      kind: "deterministic_action",
      authorship: "system",
      messageIds: [input.message.id],
      sourceRecordId: input.message.id,
      producer: "chat-artifact.capture.v1",
      evidenceKey: `chat-artifact:${input.scope.relationId}:${input.message.id}`,
    },
    confidence: 1,
    userConfirmed: true,
    occurredAt: input.message.timestamp,
    recordedAt: input.message.timestamp,
  });
  return decision.accepted ? decision.claim : undefined;
}
