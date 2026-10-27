import { LEGACY_MIGRATION_BATCH_SOURCES, LEGACY_MIGRATION_BATCH_CHARACTERS, legacyMigrationContentKey } from "../../../domain/memory/legacyMigrationBatchPolicy";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { readMemoryOrganization } from "./memoryOrganizationService";
import { organizationSourceRevision } from "../../../domain/characterKnowledge/knowledgeOrganization";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";

export const isLegacyMigrationSource=(c:KnowledgeClaim)=>Boolean(c.legacyCompatible||c.organizationOriginal||["legacy_memory","import"].includes(c.source.kind));
/** Scope/remaining-version aware local estimate; a punctuation boundary can add a batch. */
export function estimateLegacyMigration(){
  const claims=loadKnowledgeClaims(),organization=readMemoryOrganization();
  if(!claims.valid||!organization.valid)return undefined;
  const groups=new Map<string,KnowledgeClaim[]>();
  for(const c of claims.value){
    const revision=organizationSourceRevision(c);
    if(!isLegacyMigrationSource(c)||c.status!=="active"||c.recallDisabled||c.supersededById||c.organizationSourceId||c.coreMemory||c.source.kind==="manual"
      ||organization.value.processed[c.id]===revision||organization.value.unresolved?.[c.id]?.revision===revision&&organization.value.unresolved[c.id].attempts>=3)continue;
    const scope=JSON.stringify([c.characterId,c.userIdentityId,c.relationId,c.conversationId]);groups.set(scope,[...(groups.get(scope)||[]),c]);
  }
  let batches=0,sources=0;
  for(const rows of groups.values()){
    let used=0,count=0;sources+=rows.length;
    const seen=new Set<string>();
    for(const c of rows){const previousOffset=organization.value.offsets?.[c.id];const key=legacyMigrationContentKey(c,previousOffset?.revision===organizationSourceRevision(c)?previousOffset.offset:0);if(seen.has(key))continue;seen.add(key);const offset=organization.value.offsets?.[c.id];let remaining=c.statement.length-(offset?.revision===organizationSourceRevision(c)?offset.offset:0);
      if(remaining<=0)remaining=c.statement.length;
      while(remaining>0){const size=Math.min(LEGACY_MIGRATION_BATCH_CHARACTERS,remaining);if(count>=LEGACY_MIGRATION_BATCH_SOURCES||used+size>LEGACY_MIGRATION_BATCH_CHARACTERS){batches++;used=0;count=0;}used+=size;count++;remaining-=size;}
    }if(count)batches++;
  }
  return {sources,scopes:groups.size,batches};
}
