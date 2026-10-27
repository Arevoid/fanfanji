import type {Character,OfflineStory} from "../../../types";
import type {CharacterRelationship} from "../../../domain/relationship/characterRelationship";
import {DEFAULT_IDENTITY_ID} from "../../../domain/relationship/characterRelationship";
import {resolveCanonicalCharacterId,resolveOfflineStoryCharacterIds} from "../../../domain/character/characterIdentity";

/** Legacy ownership is inferred only from a unique, existing relation. Names
 * and avatars are never identifiers; an invalid explicit ID never falls back. */
export function resolveOfflineMemoryRepairScope(story:OfflineStory,characters:readonly Character[],relationships:readonly CharacterRelationship[],activeIdentityId:string){
 const ids=resolveOfflineStoryCharacterIds(story,[...characters]);
 const participants=ids.map(id=>characters.find(c=>c.id===id&&!c.isGroupChat));
 if(!participants.length||participants.some(c=>!c))throw Error("剧情参与角色资料不完整，未开始修复");
 if(story.ownerIdentityId&&story.ownerIdentityId!==activeIdentityId)throw Error("剧情不属于当前用户身份，未开始修复");
 const direct=Boolean(story.relationId)||participants.length===1;
 if(direct&&participants.length!==1)throw Error("剧情关系与参与角色不一致，未开始修复");
 if(!direct&&!story.ownerIdentityId){
  const owner=characters.find(c=>c.id===story.characterId)?.ownerIdentityId||DEFAULT_IDENTITY_ID;
  if(owner!==activeIdentityId)throw Error("无法确定旧多人剧情的所属身份，未开始修复");
 }
 const resolved=participants.map(character=>{
  const candidates=relationships.filter(r=>(!story.relationId||r.id===story.relationId)
   &&r.userIdentityId===activeIdentityId&&resolveCanonicalCharacterId(r.characterId,[...characters])===character!.id
   &&(!direct||!story.conversationId||r.conversationId===story.conversationId));
  if(candidates.length!==1||!candidates[0].conversationId)throw Error("无法唯一核对剧情的角色关系和会话来源，未开始修复");
  return {character:character!,relationship:{...candidates[0],characterId:character!.id}};
 });
 const normalized:OfflineStory={...story,ownerIdentityId:activeIdentityId,
  ...(direct?{characterId:resolved[0].character.id,characterIds:story.characterIds?[resolved[0].character.id]:undefined,relationId:resolved[0].relationship.id,conversationId:resolved[0].relationship.conversationId}:{characterIds:ids})};
 return {story:normalized,participants:resolved};
}
