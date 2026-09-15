import type { Message } from "../../../types";
import type { CharacterTruthScope, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { evaluateKnowledgeWrite } from "../../../domain/characterKnowledge/knowledgeWritePolicy";

/** Explicit user-authored plan language that is safe to promote immediately. */
const EXPLICIT_PLAN_PATTERN = /(?:约定|说好了|说定了|每天.{0,16}(?:打卡|发|给|做|报到)|每次.{0,12}(?:都|要)|以后(?:都|要)|下次(?:要|就)|连续\d+天|答应|承诺|暗号|打卡格式)/u;
const QUESTION_OR_PROPOSAL_PATTERN = /[?？]|(?:要不要|是不是|能不能|可以吗|行不行)/u;
/** Acceptance must be explicit; ordinary warmth such as “我会陪着你” is not enough. */
const EXPLICIT_ACCEPTANCE_PATTERN = /(?:答应你|说定了|说好了|就这么办|没问题|记住了|收到|成交|那就这样|好的?[，,。！!\s]*(?:那就|每天|以后|说定)|可以[，,。！!\s]|行[，,。！!\s])/u;

const cleanSourceText = (value: string): string => value
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, 180);

export function createAcceptedRelationshipPlanClaim(input: {
  userMessage: Message;
  characterMessages: readonly Message[];
  characterName?: string;
  scope: CharacterTruthScope;
  now?: number;
}): KnowledgeClaim | undefined {
  const userText = cleanSourceText(input.userMessage.content);
  const characterText = cleanSourceText(input.characterMessages.map((message) => message.content).join(" "));
  if (!userText || !characterText
    || input.userMessage.sender !== "user"
    || input.characterMessages.length === 0
    || !input.characterMessages.every((message) => message.sender === "character")
    || !EXPLICIT_PLAN_PATTERN.test(userText)
    || QUESTION_OR_PROPOSAL_PATTERN.test(userText)
    || !EXPLICIT_ACCEPTANCE_PATTERN.test(characterText)) return undefined;

  const now = input.now ?? Date.now();
  const sourceMessageIds = [input.userMessage.id, ...input.characterMessages.map((message) => message.id)];
  const characterLabel = input.characterName?.trim() || "角色";
  const statement = `用户与${characterLabel}就以下内容达成约定：${userText}`;
  const decision = evaluateKnowledgeWrite({
    id: `claim:relationship-plan:${input.scope.relationId}:${input.userMessage.id}`,
    ...input.scope,
    kind: "plan",
    subject: "relationship",
    statement,
    temporalStatus: "future",
    source: {
      kind: "user_message",
      authorship: "user",
      messageIds: sourceMessageIds,
      producer: "relationship-commitment.capture.v1",
      evidenceKey: `relationship-plan:${input.scope.relationId}:${input.userMessage.id}`,
    },
    confidence: 0.8,
    userConfirmed: false,
    occurredAt: input.userMessage.timestamp,
    recordedAt: now,
  });
  return decision.accepted ? decision.claim : undefined;
}
