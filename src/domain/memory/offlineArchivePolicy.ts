import type {Message,OfflineStory} from "../../types";
import {getOfflineMemorySourceMessages,offlineMemorySourceRevision,isOfflineStoryMessageSyncable} from "./offlineMemorySync";
export const OFFLINE_ARCHIVE_TURNS=6;
export const OFFLINE_ARCHIVE_CHARACTERS=12_000;
export function shouldArchiveOfflineProgress(story:OfflineStory):boolean {
 const messages=getOfflineMemorySourceMessages(story);
 return messages.filter(message=>message.sender==="character").length>=OFFLINE_ARCHIVE_TURNS
  ||messages.reduce((total,message)=>total+message.content.length,0)>=OFFLINE_ARCHIVE_CHARACTERS;
}
/** Whole-message commit boundary; exceptionally long messages are split by the extractor. */
export function nextOfflineArchiveBatch(messages:readonly Message[]):Message[]{
 const selected:Message[]=[];let size=0;
 for(const message of messages){if(selected.length&&(size+message.content.length>OFFLINE_ARCHIVE_CHARACTERS||selected.length>=24||selected.some(previous=>previous.id===message.id)))break;selected.push(message);size+=message.content.length;}
 return selected;
}
/** Lossless provider windows. Prefer paragraph boundaries and never discard a tail. */
export function splitOfflineSourceText(content:string,limit=12_000):string[]{
 const parts:string[]=[];let rest=content;
 while(rest.length>limit){let end=rest.lastIndexOf("\n",limit);if(end<limit/2)end=limit;else end++;if(end<rest.length&&/[\uD800-\uDBFF]/u.test(rest[end-1]))end--;parts.push(rest.slice(0,end));rest=rest.slice(end);}
 if(rest.length)parts.push(rest);return parts;
}

/** A background result owns only archive progress, never the newer scene text. */
export function mergeOfflineArchiveProgress(current:OfflineStory,archived:OfflineStory):OfflineStory {
 if(current.id!==archived.id)return current;
 const revisions={...archived.syncedSourceMessageRevisions,...current.syncedSourceMessageRevisions};
 const valid=Object.fromEntries(current.messages.filter(isOfflineStoryMessageSyncable)
  .filter(message=>revisions[message.id]===offlineMemorySourceRevision(message))
  .map(message=>[message.id,revisions[message.id]]));
 const work={...current.memoryArchiveWork};
 for(const [id,checkpoint] of Object.entries(archived.memoryArchiveWork||{})){
  if(Object.entries(checkpoint.sourceRevisions).every(([sourceId,revision])=>current.messages.some(message=>message.id===sourceId&&offlineMemorySourceRevision(message)===revision)))work[id]=checkpoint;
 }
 for(const [id,checkpoint] of Object.entries(work)){
  if(!archived.memoryArchiveWork?.[id]&&archived.memorySyncStatus==="synced"
    &&Object.entries(checkpoint.sourceRevisions).every(([sourceId,revision])=>archived.syncedSourceMessageRevisions?.[sourceId]===revision))delete work[id];
 }
 const result={...current,memoryArchiveWork:work,memoryArchiveVersion:archived.memoryArchiveVersion||current.memoryArchiveVersion,memoryRepair:archived.memoryRepair,
  memorySyncReport:archived.memorySyncReport||current.memorySyncReport,
  lastMemorySyncError:archived.lastMemorySyncError,syncedSourceMessageIds:Object.keys(valid),syncedSourceMessageRevisions:valid,
  archivedMemoryIds:[...new Set([...(current.archivedMemoryIds||[]),...(archived.archivedMemoryIds||[])])],
  lastMemorySyncAt:Math.max(current.lastMemorySyncAt||0,archived.lastMemorySyncAt||0),
  lastSyncedMessageCount:Math.max(current.lastSyncedMessageCount||0,archived.lastSyncedMessageCount||0)};
 return {...result,memorySyncStatus:archived.memorySyncStatus==="partial"||archived.memorySyncStatus==="failed"?archived.memorySyncStatus:getOfflineMemorySourceMessages(result).length?"pending":"synced"};
}
