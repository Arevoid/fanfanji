import type {OfflineStory} from "../../../types";
import {loadConversationSummaries} from "../../../core/storage/repositories/conversationSummaryRepository";
import {getOfflineStorySummaryId,offlineMemorySourceRevision} from "../../../domain/memory/offlineMemorySync";
/** Only this scene's validated archive; never another relationship's background knowledge. */
export function readOfflineCumulativeMemoryContext(story:OfflineStory):string {
 if(!story.relationId||story.characterIds&&story.characterIds.some(id=>id!==story.characterId))return "";
 const summary=loadConversationSummaries().value.find(record=>record.id===getOfflineStorySummaryId(story)
  &&record.status==="active"&&record.relationId===story.relationId&&record.characterId===story.characterId
  &&record.userIdentityId===story.ownerIdentityId&&record.conversationId===story.conversationId);
 if(!summary?.sourceMessageRevisions||!summary.sourceMessageIds.every(id=>story.messages.some(message=>message.id===id&&summary.sourceMessageRevisions![id]===offlineMemorySourceRevision(message))))return "";
 return summary.summary;
}
