import type { Character, ForumDmConversation, ForumDmMessage, ForumDmTask, ForumNotification, ForumThread, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { apiChat } from "../../../utils/apiHelper";
import { buildForumDmPrompt } from "../../../domain/prompt/forumDmPrompt";
import { appendForumDmMessage } from "../../../domain/forum/forumDmData";
import { buildCharacterCognitiveContext } from "../../../domain/characterCognitive/contextBuilder";
import { createDirectChatKnowledgeBoundary } from "../../../domain/characterCognitive/contextPolicy";
import type { CharacterCognitiveEventCandidate } from "../../../domain/characterCognitive/characterCognitiveTypes";
import { listByRelation as listCharacterEventsByRelation } from "../../../core/storage/repositories/characterEventRepository";
import { buildRelationshipCognitiveProjection } from "../../characterLife/services/relationshipCognitiveProjectionService";
import {
  buildForumDirectMessagePromptContext,
  formatForumDirectMessagePromptContext,
} from "../../characterCognitive/promptAdapters/forumDirectMessagePromptAdapter";

const sanitize = (value: string) => value.replace(/\[[^\]]*(?:发送于|图片|语音)[^\]]*\]/g, "").replace(/[（(][^）)]*(?:发送|照片|图片|语音|表情)[^）)]*[）)]/g, "").replace(/\s+/g, " ").trim().slice(0, 1200);
const taskKey = (ownerIdentityId: string, conversationId: string) => `forum-dm-reply:${ownerIdentityId}:${conversationId}`;

const getForumDmEventVisibility = (event: CharacterCognitiveEventCandidate["event"]): CharacterCognitiveEventCandidate["promptVisibility"] =>
  event.status === "active"
    && (event.kind === "relationship_created" || event.kind === "offline_story_completed")
    ? "safe"
    : "private";

export const requestForumDmReply = async (input: { conversation: ForumDmConversation; conversations: ForumDmConversation[]; messages: ForumDmMessage[]; tasks: ForumDmTask[]; threads: ForumThread[]; notifications: ForumNotification[]; relationships: CharacterRelationship[]; characters: Character[]; settings: UserSettings; profileName: string; activeConversationId?: string | null; isConversationCurrent?: (conversationId: string, revision?: number) => boolean; commit: (value: { dmConversations?: ForumDmConversation[]; dmMessages?: ForumDmMessage[]; dmTasks?: ForumDmTask[]; notifications?: ForumNotification[] }) => boolean }): Promise<void> => {
  if (input.tasks.some((task) => task.taskKey === taskKey(input.conversation.ownerIdentityId, input.conversation.id) && task.status === "running")) return;
  const now = Date.now(); const task: ForumDmTask = { id: `forum-dm-task-${now}`, taskKey: taskKey(input.conversation.ownerIdentityId, input.conversation.id), ownerIdentityId: input.conversation.ownerIdentityId, conversationId: input.conversation.id, status: "running", startedAt: now, createdAt: now, updatedAt: now };
  const allTasks = [...input.tasks, task];
  if (!input.commit({ dmTasks: allTasks })) throw new Error("私信任务保存失败");
  try {
    let character: Character | undefined;
    let relationship: CharacterRelationship | undefined;
    if (input.conversation.participant.kind === "relationship") {
      const actor = input.conversation.participant;
      const relation = input.relationships.find((item) => item.id === actor.relationId && item.userIdentityId === input.conversation.ownerIdentityId && item.characterId === actor.characterId);
      relationship = relation;
      if (!relation) throw new Error("该论坛私信会话已不可用");
      character = input.characters.find((item) => item.id === relation.characterId && !item.isGroupChat);
      if (!character) throw new Error("该论坛私信会话已不可用");
    }
    if (!input.settings.apiKey?.trim() || !input.settings.selectedModel?.trim()) throw new Error("论坛私信 AI 配置缺失");
    const ownMessages = input.messages.filter((message) => message.conversationId === input.conversation.id).sort((a, b) => a.occurredAt - b.occurredAt);
    const cognitiveContext = character && relationship
      ? (() => {
        try {
          const relationEvents = listCharacterEventsByRelation(relationship.id);
          const relationshipProjection = buildRelationshipCognitiveProjection({
            relation: relationship,
            events: relationEvents,
            now,
          });
          return buildCharacterCognitiveContext({
            character,
            relation: relationship,
            // Forum DMs intentionally do not consume private chat Memory.
            memories: [],
            events: relationEvents.map((event) => ({ event, promptVisibility: getForumDmEventVisibility(event) })),
            timeContext: { now },
            knowledgeBoundary: createDirectChatKnowledgeBoundary(),
            conversationId: relationship.conversationId,
            relationshipTimeline: relationshipProjection.timeline,
          });
        } catch {
          return undefined;
        }
      })()
      : undefined;
    const cognitiveSupplement = cognitiveContext
      ? formatForumDirectMessagePromptContext(buildForumDirectMessagePromptContext(cognitiveContext))
      : "";
    const prompt = buildForumDmPrompt({ conversation: input.conversation, messages: ownMessages, thread: input.threads.find((thread) => thread.id === input.conversation.originThreadId), character, profileName: input.profileName, settings: input.settings });
    const result = await apiChat({ ...prompt, ...(cognitiveSupplement ? { systemInstruction: `${prompt.systemInstruction}\n\n${cognitiveSupplement}` } : {}), apiKey: input.settings.apiKey, model: input.settings.selectedModel, apiEndpoint: input.settings.apiEndpoint, apiTemperature: input.settings.apiTemperature, streamCompatible: input.settings.streamCompatible });
    const body = sanitize(result.text || ""); if (!body) throw new Error("论坛私信回复内容无效");
    if (input.isConversationCurrent && !input.isConversationCurrent(input.conversation.id, input.conversation.revision)) return;
    const appended = appendForumDmMessage({ messages: input.messages, conversations: input.conversations, conversationId: input.conversation.id, ownerIdentityId: input.conversation.ownerIdentityId, sender: "participant", body, activeConversationId: input.activeConversationId, now: Date.now() });
    const notification: ForumNotification | undefined = input.activeConversationId === input.conversation.id ? undefined : { id: `forum-dm-notice-${appended.message.id}`, eventKey: `forum-dm:${appended.message.id}`, ownerIdentityId: input.conversation.ownerIdentityId, type: "direct-message", actorPublicSnapshot: input.conversation.participantPublicSnapshot, threadId: input.conversation.originThreadId || "", replyId: appended.message.id, conversationId: input.conversation.id, preview: body.slice(0, 120), occurredAt: appended.message.occurredAt };
    input.commit({ dmConversations: appended.conversations, dmMessages: appended.messages, dmTasks: allTasks.map((item) => item.id === task.id ? { ...item, status: "succeeded", completedAt: Date.now(), updatedAt: Date.now() } : item), ...(notification ? { notifications: [...input.notifications, notification].slice(-300) } : {}) });
  } catch (error) {
    if (input.isConversationCurrent && !input.isConversationCurrent(input.conversation.id, input.conversation.revision)) return;
    input.commit({ dmTasks: allTasks.map((item) => item.id === task.id ? { ...item, status: "failed", completedAt: Date.now(), updatedAt: Date.now() } : item) });
    throw error;
  }
};
