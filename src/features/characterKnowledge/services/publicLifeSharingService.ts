import { loadCharacterContinuity,updateCharacterContinuity } from "../../../core/storage/repositories/characterContinuityRepository";
import { sourceRevision } from "../../../domain/characterKnowledge/knowledgeEvolution";
import type { CharacterLifeEpisode } from "../../../domain/memory/characterContinuity";
export const lifePublicRevision = (episode: CharacterLifeEpisode) => sourceRevision(JSON.stringify([
  episode.id,episode.characterId,episode.userIdentityId,episode.summary,episode.status,episode.supersededById,
  episode.occurredAt,episode.participantIds,episode.scheduleSlot,episode.intervention,
]));
export function setLifePublicSharing(id:string,characterId:string,userIdentityId:string,allowed:boolean,now=Date.now()) {
  const read=loadCharacterContinuity();const target=read.value.life.find(e=>e.id===id&&e.characterId===characterId&&e.userIdentityId===userIdentityId);
  if(!read.valid||!target||allowed&&(target.status!=="completed"||target.supersededById||target.occurredAt>now))return {success:false,error:"validation" as const};
  return updateCharacterContinuity(s=>({...s,life:s.life.map(e=>e.id!==id||e.characterId!==characterId||e.userIdentityId!==userIdentityId?e:
    {...e,publicSharing:allowed?{revision:lifePublicRevision(e),approvedAt:now}:undefined})}),read.value.revision);
}
export function publicLifeMaterial(characterId:string,userIdentityId:string,now=Date.now()) {
  const read=loadCharacterContinuity();if(!read.valid)return [];
  return read.value.life.filter(e=>e.characterId===characterId&&e.userIdentityId===userIdentityId&&e.status==="completed"&&!e.supersededById
    &&e.occurredAt<=now&&e.publicSharing&&e.publicSharing.approvedAt<=now&&e.publicSharing.revision===lifePublicRevision(e))
    .sort((a,b)=>b.occurredAt-a.occurredAt).slice(0,3).map(e=>({id:e.id,revision:e.publicSharing!.revision,summary:e.summary,occurredAt:e.occurredAt}));
}
