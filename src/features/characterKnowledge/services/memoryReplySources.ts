import type {CharacterTruthScope} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type {ActualAssistantTurn} from "./memoryMentionService";
import {loadCommittedMessages} from "../../../core/storage/repositories/messageRepository";
import {loadCommittedCoReadingStore} from "../../../core/storage/repositories/readingCoReadingRepository";
import {loadCommittedCinemaStore} from "../../../core/storage/repositories/cinemaRepository";
import {loadDiaryEntries} from "../../../core/storage/repositories/diaryRepository";
import {loadOfflineStories} from "../../../core/storage/repositories/offlineRepository";
import {loadCharacters} from "../../../core/storage/repositories/characterRepository";
import {LEGACY_PRIMARY_IDENTITY_ID} from "../../../domain/identity/identityScope";
import {isExactTruthScope} from "../../../domain/characterKnowledge/knowledgeConflictPolicy";
import {sourceRevision} from "../../../domain/characterKnowledge/knowledgeEvolution";
import {loadMemoryMentions,saveMemoryMentions} from "../../../core/storage/repositories/memoryMentionRepository";
import {resolveCanonicalCharacterId} from "../../../domain/character/characterIdentity";

/** Reads canonical saved output, never a model draft or the prompt being built.
 * null means storage could not be confirmed; it must not erase old evidence. */
export async function loadCommittedMemoryReplyTurns(scope:CharacterTruthScope,channel="conversation",now=Date.now()):Promise<ActualAssistantTurn[]|null>{
 const turns:ActualAssistantTurn[]=[];const namespaces:string[]=[];
 const add=(prefix:string,id:string,text:unknown,at:unknown)=>{if(typeof id==="string"&&typeof text==="string"&&typeof at==="number"&&Number.isFinite(at)&&at<=now&&now-at<30*60_000&&text.trim())turns.push({id:`${prefix}:${id}`,text:text.trim().slice(0,1200),at});};
 const same=(r:{characterId:string;relationId:string;userIdentityId:string;conversationId:string})=>isExactTruthScope(r,scope);
 if(channel==="conversation"){
  const messages=await loadCommittedMessages();if(!messages.valid)return null;
  namespaces.push("chat:");
  if(messages.found){for(const message of messages.value)if(message.characterId===scope.characterId&&message.relationId===scope.relationId&&message.conversationId===scope.conversationId&&message.sender==="character"&&!message.recalledAt&&!message.isOffline&&!message.sentFromCharacterPhone)add("chat",message.id,message.content,message.timestamp);}
  const reading=await loadCommittedCoReadingStore();if(!reading.valid)return null;
  namespaces.push("reading:");
  if(reading.found){const store=reading.value;
   const rooms=new Set(store.rooms.filter(same).map(room=>room.id));
   for(const row of [...store.comments,...store.discussionMessages])if(same(row)&&rooms.has(row.readingRoomId)&&row.author==="ai")add("reading",row.id,row.body,row.createdAt);}
  namespaces.push("cinema:");const cinemaRead=loadCommittedCinemaStore();if(!cinemaRead.valid)return null;const cinema=cinemaRead.value;const rooms=new Set(cinema.rooms.filter(same).map(room=>room.id));
  for(const row of cinema.discussions)if(same(row)&&rooms.has(row.roomId))add("cinema",row.id,row.characterText,row.createdAt);
 }else if(channel==="diary"){
  const entries=loadDiaryEntries();if(!entries.valid)return null;namespaces.push("diary:");
  for(const row of entries.value)if(row.authorType==="character"&&row.source!=="manual"&&row.characterId===scope.characterId&&row.ownerIdentityId===scope.userIdentityId&&row.relationId===scope.relationId&&row.conversationId===scope.conversationId)add("diary",row.id,row.body,row.createdAt);
 }else if(channel.startsWith("group:")){
  const groupId=channel.slice(6),characters=loadCharacters([]);if(!characters.valid)return null;
  const group=characters.value.find(c=>c.id===groupId&&c.isGroupChat&&(c.ownerIdentityId||LEGACY_PRIMARY_IDENTITY_ID)===scope.userIdentityId&&c.memberIds?.some(id=>resolveCanonicalCharacterId(id,characters.value)===scope.characterId));
  namespaces.push(`group:${groupId}:`);
  if(group){const messages=await loadCommittedMessages();if(!messages.valid)return null;
   for(const message of messages.value)if(message.characterId===groupId&&message.senderId&&resolveCanonicalCharacterId(message.senderId,characters.value)===scope.characterId&&message.sender==="character"&&!message.recalledAt&&!message.isOffline)add(`group:${groupId}`,message.id,message.content,message.timestamp);}
 }else if(channel.startsWith("offline:")){
  const storyId=channel.slice(8),stories=loadOfflineStories([]);if(!stories.valid)return null;
  const story=stories.value.find(s=>s.id===storyId&&s.ownerIdentityId===scope.userIdentityId&&(s.characterIds||[s.characterId]).includes(scope.characterId));
  // Group narrative is observed as story usage, never as any participant's speech.
  namespaces.push(`offline:${storyId}:`);
  if(story)for(const message of story.messages)if(message.sender==="character"&&!message.recalledAt&&!message.isImportedContext)add(`offline:${storyId}`,message.id,message.content,message.timestamp);
 }
 const read=loadMemoryMentions();if(!read.valid)return null;
 const actual=new Map(turns.map(turn=>[turn.id,sourceRevision(turn.text)]));
 const retained=read.value.filter(record=>{
  if(!isExactTruthScope(record.scope,scope)||(record.channel||"conversation")!==channel)return true;
  // Pre-channel versions stored bare chat IDs. Reconcile them against the same
  // committed message, without interpreting another surface's ID as a chat.
  const id=channel==="conversation"&&!record.replyId.includes(":")?`chat:${record.replyId}`:record.replyId;
  return !namespaces.some(prefix=>id.startsWith(prefix))||actual.get(id)===record.replyRevision;
 });
 if(retained.length!==read.value.length&&!saveMemoryMentions(retained,now).success)return null;
 return turns.sort((a,b)=>a.at-b.at).slice(-2);
}
