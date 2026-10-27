import type { CharacterTruthScope, KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { Message } from "../../../types";
import { sourceRevision } from "../../../domain/characterKnowledge/knowledgeEvolution";
import { readJson, writeJson } from "../../../core/storage/storageAdapter";
import { loadMessages } from "../../../core/storage/repositories/messageRepository";
import { createId } from "../../../core/id/createId";

const KEY = "phone_memory_extraction_tasks_v1";
interface Task { id: string; owner: string; scope: CharacterTruthScope; revisions: Record<string, string>;
  status: "running" | "completed" | "failed"; updatedAt: number; attempts: number }
const readTasks = () => readJson<Task[]>(KEY, []);
const messageRevision = (message: Message) => sourceRevision(JSON.stringify([message.content, message.sender,
  message.senderId, message.timestamp, message.imageAssetId]));
export function isMemoryExtractionTaskPending(scope:CharacterTruthScope,messages:readonly Message[],now=Date.now()){
  const read=readTasks();if(!read.valid||!Array.isArray(read.value))return false;
  const revisions=Object.fromEntries(messages.map(message=>[message.id,messageRevision(message)]));
  const id=`${scope.characterId}:${scope.relationId}:${scope.userIdentityId}:${scope.conversationId}:${sourceRevision(JSON.stringify(revisions))}`;
   const previous=read.value.find(task=>task.id===id||(task.status==="completed"||task.status==="running"&&now-task.updatedAt<120_000)&&task.scope.characterId===scope.characterId&&task.scope.relationId===scope.relationId
    &&task.scope.userIdentityId===scope.userIdentityId&&task.scope.conversationId===scope.conversationId&&Object.entries(revisions).every(([key,value])=>task.revisions[key]===value));
  return !previous||previous.status==="failed"&&now-previous.updatedAt>=Math.min(3600_000,30_000*2**Math.min(previous.attempts,7))
    ||previous.status==="running"&&now-previous.updatedAt>=120_000;
}
export function beginMemoryExtractionTask(scope: CharacterTruthScope, messages: readonly Message[], now = Date.now()) {
  const revisions = Object.fromEntries(messages.map((message) => [message.id, messageRevision(message)]));
  const id = `${scope.characterId}:${scope.relationId}:${scope.userIdentityId}:${scope.conversationId}:${sourceRevision(JSON.stringify(revisions))}`;
  const read = readTasks();
  if (!read.valid || !Array.isArray(read.value)) return undefined;
  const previous = read.value.find((task) => task.id === id);
  if (read.value.some((task) => task.id !== id && task.status === "running" && now - task.updatedAt < 120_000
    && task.scope.characterId === scope.characterId && task.scope.relationId === scope.relationId
    && task.scope.userIdentityId === scope.userIdentityId && task.scope.conversationId === scope.conversationId
    && Object.entries(revisions).some(([key, value]) => task.revisions[key] === value))) return undefined;
  if (previous?.status === "running" && now - previous.updatedAt < 120_000) return undefined;
  const task: Task = { id, owner: createId("extraction-lease"), scope, revisions, status: "running", updatedAt: now, attempts: (previous?.attempts || 0) + 1 };
  if (!writeJson(KEY, [...read.value.filter((item) => item.id !== id), task]).success) return undefined;
  return task;
}
export function finishMemoryExtractionTask(task: Task, status: "completed" | "failed") {
  const read = readTasks();
  if (!read.valid || !Array.isArray(read.value)) return false;
  const current = read.value.find((item) => item.id === task.id);
  if (current?.owner !== task.owner) return false;
  if (current.status === "completed") return true;
  return writeJson(KEY, read.value.map((item) => item.id === task.id ? { ...item, status, updatedAt: Date.now() } : item)).success;
}
export function memoryExtractionSourcesStillCurrent(task: Task) {
  const lease = readTasks();
  if (!lease.valid || !Array.isArray(lease.value) || !lease.value.some((item) => item.id === task.id
    && item.owner === task.owner && item.status === "running")) return false;
  const current = loadMessages([]);
  if (!current.valid) return false;
  return Object.entries(task.revisions).every(([id, revision]) => current.value.some((message) =>
    message.id === id && messageRevision(message) === revision && message.characterId === task.scope.characterId
    && message.relationId === task.scope.relationId && message.conversationId === task.scope.conversationId));
}
export function filterForgottenCandidates(claims: readonly KnowledgeClaim[], forgotten: readonly { scope: CharacterTruthScope; sourceIds: string[]; statement: string }[]) {
  return claims.filter((claim) => !forgotten.some((record) => record.scope.characterId === claim.characterId
    && record.scope.relationId === claim.relationId && record.scope.userIdentityId === claim.userIdentityId
    && record.scope.conversationId === claim.conversationId && (record.statement === claim.statement
      || claim.source.messageIds?.some((id) => record.sourceIds.includes(id)))));
}
