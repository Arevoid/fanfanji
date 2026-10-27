import type { CharacterTruthScope, KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import { isExactTruthScope } from "../characterKnowledge/knowledgeConflictPolicy";
import { isKnowledgeTemporallyActive } from "../characterKnowledge/knowledgeTemporalPolicy";
import { deriveKnowledgeSemantics, asksForHistory } from "../characterKnowledge/knowledgeEvolution";
import { isLifeCompletionCompatible,isExplicitLifeStepFailure } from "./lifeActivityPolicy";
import { canScheduleLife, isLifeScheduleSlot, type LifeScheduleSlot } from "./lifeSchedulePolicy";
import { memoryRelevance } from "./memoryRelevance";
import { canonicalImpressionTheme, normalizeImpressionGrowth } from "./impressionGrowth";
import type { RelationshipDimensions } from "../characterLife/relationshipGrowth";
import { advanceLifeActivity, proposeLifeActivity, type CharacterLifeActivity } from "./characterLifeActivity";
import type { ContinuousLifeState, LifeWitness } from "./continuousLifeState";
import { inferMemoryQueryConstraints, matchesMemoryQueryConstraints, type MemoryQueryConstraints } from "./memoryQueryConstraints";

export interface CharacterImpression {
  id: string; scope: CharacterTruthScope; category: string; proposition: string;
  confidence: number; sourceClaimIds: string[]; recordedAt: number;
  status: "active" | "superseded" | "invalid" | "candidate"; supersedesId?: string; intervention?: boolean; paused?: boolean;
  themeKey?: string; opposingClaimIds?: string[]; growth?: Partial<RelationshipDimensions>;
  themeReferenceId?: string; revisionReason?: string; revisionMode?: "reinforce" | "revise" | "oppose";
  resolvedById?: string;
}
export interface CharacterLifeEpisode {
  experienceAssessed?: boolean;
  experience?: import("./characterExperience").CharacterExperience;
  publicSharing?: { revision: string; approvedAt: number };
  scheduleSlot?: LifeScheduleSlot;
  summaryHistory?: { text: string; editedAt: number }[];
  intervention?: boolean;
  id: string; characterId: string; userIdentityId: string; summary: string;
  occurredAt: number; recordedAt: number; status: "completed" | "planned" | "cancelled";
  origin: "foreground_simulation"; private: true;
  previousEpisodeId?: string;
  supersededById?: string;
  participantIds?: string[];
  activity?: CharacterLifeActivity;
}
export interface ContinuityTask {
  id: string; scope: CharacterTruthScope; day: string; startedAt: number;
  status: "running" | "completed" | "failed"; attempts: number; nextAttemptAt?: number;
  evidenceVersions?: Record<string, string>;
}
export interface CharacterContinuityStore {
  suppressedImpressions?: { scope: CharacterTruthScope; sourceClaimIds: string[]; deletedAt: number }[];
  version: 1; revision: number; impressions: CharacterImpression[]; life: CharacterLifeEpisode[];
  lifeStates?: ContinuousLifeState[];
  lifeWitnesses?: LifeWitness[];
  tasks: ContinuityTask[]; forgotten: { scope: CharacterTruthScope; claimId?: string; statement: string; semanticKey?: string; semanticValue?: string; sourceIds: string[];
    forgottenAt?: number; sourceRecordId?: string; organizationSourceId?: string }[];
}
export const emptyCharacterContinuity = (): CharacterContinuityStore => ({
  version: 1, revision: 0, impressions: [], life: [], tasks: [], forgotten: [],
});
export function projectCharacterContinuityReadFrame(store: CharacterContinuityStore, knownAt?: number): CharacterContinuityStore {
  if (knownAt === undefined) return store;
  return { ...store,
    impressions: store.impressions.filter((record) => record.recordedAt <= knownAt).map((record) => {
      const successor = store.impressions.find((next) => next.supersedesId === record.id);
      return record.status === "superseded" && successor && successor.recordedAt > knownAt
        ? { ...record, status: successor.intervention ? "invalid" as const : "active" as const } : record;
    }),
    life: store.life.filter((record) => record.recordedAt <= knownAt && record.occurredAt <= knownAt).map((record) => {
      const successor = store.life.find((next) => next.id === record.supersededById);
      return successor && successor.recordedAt > knownAt ? { ...record, supersededById: undefined } : record;
    }), lifeStates: [], lifeWitnesses: store.lifeWitnesses?.filter((record) => record.acquiredAt <= knownAt) };
}
export function isForgottenKnowledge(claim: KnowledgeClaim, records: CharacterContinuityStore["forgotten"]): boolean {
  return records.some((record) => isExactTruthScope(claim, record.scope) && (
    (record.forgottenAt === undefined || (claim.source.statementAt ?? claim.recordedAt) <= record.forgottenAt) && (record.statement === claim.statement
      || record.semanticKey && record.semanticKey === (claim.semantics || deriveKnowledgeSemantics(claim))?.key
        && (!record.semanticValue || record.semanticValue === (claim.semantics || deriveKnowledgeSemantics(claim))?.value))
    || record.claimId && (claim.id === record.claimId || claim.organizationSourceId === record.claimId)
    || record.organizationSourceId && claim.organizationSourceId === record.organizationSourceId && record.statement === claim.statement
    || record.sourceRecordId && claim.source.sourceRecordId === record.sourceRecordId && record.statement === claim.statement
    || claim.source.messageIds?.some((id) => record.sourceIds.includes(id))));
}
export function eligibleImpressionEvidence(claim: KnowledgeClaim, scope: CharacterTruthScope, now: number): boolean {
  return isExactTruthScope(claim, scope) && isKnowledgeTemporallyActive(claim, now)
    && !claim.recallDisabled && !claim.supersededById
    && claim.temporalStatus !== "future" && claim.kind !== "plan" && claim.kind !== "hypothesis"
    && ["confirmed", "asserted"].includes(claim.truthStatus)
    && claim.truthStatus !== "legacy_unverified";
}
export function eligibleHistoricalImpression(record: CharacterImpression, claims: readonly KnowledgeClaim[], now: number): boolean {
  return record.recordedAt <= now && (record.intervention || record.sourceClaimIds.length > 0 && record.sourceClaimIds.every((ref) => claims.some((claim) =>
    (claim.id === ref || claim.mergedClaimIds?.includes(ref)) && isExactTruthScope(claim, record.scope) && claim.status === "active"
    && claim.recordedAt <= now && !claim.recallDisabled && claim.retractionReason !== "corrected" && claim.temporalStatus !== "future"
    && claim.kind !== "plan" && claim.kind !== "hypothesis" && ["asserted", "confirmed"].includes(claim.truthStatus))));
}
export function reconcileImpressions(records: readonly CharacterImpression[], claims: readonly KnowledgeClaim[], now: number): CharacterImpression[] {
  return records.map((record) => !["active", "candidate"].includes(record.status) || record.intervention ? record : {
    ...record, status: record.sourceClaimIds.length > 0 && record.sourceClaimIds.every((id) =>
      claims.some((claim) => (claim.id === id || claim.mergedClaimIds?.includes(id)) && eligibleImpressionEvidence({ ...claim, recallDisabled: false }, record.scope, now))) ? record.status : "invalid",
  });
}
/** A suggestion references runtime-issued evidence IDs, never model-issued ownership. */
export function acceptImpression(input: unknown, scope: CharacterTruthScope, claims: readonly KnowledgeClaim[], now: number, id: string,
  existing?: readonly CharacterImpression[], themeResolution?: { newTheme: true; reason: string }): CharacterImpression | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  if (typeof value.proposition !== "string" || !value.proposition.trim() || value.proposition.length > 400
    || typeof value.category !== "string" || !value.category.trim() || value.category.length > 40
    || !Array.isArray(value.sourceClaimIds) || value.sourceClaimIds.length === 0 || value.sourceClaimIds.length > 8
    || !value.sourceClaimIds.every((ref) => typeof ref === "string" && claims.some((claim) =>
      claim.id === ref && eligibleImpressionEvidence(claim, scope, now)))) return undefined;
  const reference = existing?.find((record) => record.id === value.themeReferenceId && isExactTruthScope(record.scope, scope)
    && ["active", "candidate"].includes(record.status));
  if (value.themeReferenceId !== undefined && (!reference || typeof value.revisionReason !== "string" || !value.revisionReason.trim())) return undefined;
  const unresolvedTheme = !reference && !themeResolution && existing?.some((record) => isExactTruthScope(record.scope, scope)
    && ["active", "candidate"].includes(record.status));
  return { id, scope: { ...scope }, proposition: value.proposition.trim(), category: value.category.trim(),
    themeKey: reference?.themeKey || (reference ? `theme:${reference.id}` : existing ? `theme:${id}` : canonicalImpressionTheme(value.category)),
    ...(reference ? { themeReferenceId: reference.id } : {}),
    ...(unresolvedTheme ? { revisionReason: "语义主题尚未与已有认识核对，暂不影响行为" }
      : themeResolution ? { revisionReason: themeResolution.reason.slice(0, 600) }
      : typeof value.revisionReason === "string" ? { revisionReason: value.revisionReason.slice(0, 600) } : {}),
    ...(["reinforce", "revise", "oppose"].includes(String(value.revisionMode)) ? { revisionMode: value.revisionMode as CharacterImpression["revisionMode"] } : {}),
    ...(normalizeImpressionGrowth(value.growth) ? { growth: normalizeImpressionGrowth(value.growth) } : {}),
    ...(Array.isArray(value.opposingClaimIds) && value.opposingClaimIds.every((ref) => typeof ref === "string" && (value.sourceClaimIds as string[]).includes(ref))
      ? { opposingClaimIds: [...new Set(value.opposingClaimIds as string[])] } : {}),
    confidence: Math.min(0.75, Math.max(0.1, typeof value.confidence === "number" && Number.isFinite(value.confidence) ? value.confidence : 0.4)),
    sourceClaimIds: [...new Set(value.sourceClaimIds as string[])], recordedAt: now, status: unresolvedTheme ? "candidate" : "active" };
}
export function reviseImpression(records: readonly CharacterImpression[], next: CharacterImpression, claims?: readonly KnowledgeClaim[]): CharacterImpression[] {
  const previous = records.find((record) => record.status === "active"
    && (record.themeKey || canonicalImpressionTheme(record.category)) === (next.themeKey || canonicalImpressionTheme(next.category)) && isExactTruthScope(record.scope, next.scope));
  if (previous?.proposition === next.proposition && !next.intervention) return [...records];
  if (previous && !next.intervention && next.sourceClaimIds.every((id) => previous.sourceClaimIds.includes(id))) return [...records];
  if (previous && !next.intervention) {
    const groups = (ids: readonly string[]) => {
      const result = new Map<string, number>();
      for (const id of ids) {
        const claim = claims?.find((record) => (record.id === id || record.mergedClaimIds?.includes(id)) && eligibleImpressionEvidence(record, next.scope, next.recordedAt));
        if (claims && !claim) continue;
        for (const group of claim?.source.evidenceGroups || [claim?.source.messageIds || [id]]) {
          const key = [...group].sort().join("\u0000");
          if (key) result.set(key, Math.max(result.get(key) || 0, claim?.confidence ?? 1));
        }
      }
      return result;
    };
    if (next.revisionMode === "reinforce") return records.map((record) => record !== previous ? record : { ...record,
      sourceClaimIds: [...new Set([...record.sourceClaimIds, ...next.sourceClaimIds])],
      confidence: Math.min(.75, record.confidence + Math.min(.05, next.confidence * .05)), revisionReason: next.revisionReason });
    const priorGroups = groups(previous.sourceClaimIds);
    // A new semantic judgment must explicitly cite the accumulated evidence.
    // Merely belonging to the same theme does not make two candidate opinions agree.
    const newIds = [...new Set(next.sourceClaimIds)];
    const usedSourceIds = new Set([...priorGroups.keys()].flatMap((key) => key.split("\u0000")));
    const fresh = [...groups(newIds)].filter(([key]) => {
      const ids = key.split("\u0000");
      if (ids.some((id) => usedSourceIds.has(id))) return false;
      ids.forEach((id) => usedSourceIds.add(id)); return true;
    });
    const oldWeight = [...priorGroups.values()].reduce((sum, value) => sum + value, 0) * previous.confidence;
    const newWeight = fresh.reduce((sum, [, value]) => sum + value, 0) * next.confidence;
    if (fresh.length < 2 || newWeight < Math.max(.35, oldWeight * .6)) {
      return [...records, { ...next, status: "candidate", supersedesId: previous.id,
        revisionReason: `${next.revisionReason || "新经历提出了不同看法"}；独立新证据 ${fresh.length} 组，权重 ${newWeight.toFixed(2)}，既有依据 ${oldWeight.toFixed(2)}，暂不替换长期认识` }];
    }
    next = { ...next, sourceClaimIds: newIds,
      revisionReason: `${next.revisionReason || "多次新经历支持修订"}；${fresh.length} 组独立新证据支持，保留旧认识和反对证据` };
  }
  return [...records.map((record) => record === previous ? { ...record, status: "superseded" as const }
    : record.status === "candidate" && record.themeKey === next.themeKey && isExactTruthScope(record.scope, next.scope)
      && record.sourceClaimIds.every((ref) => next.sourceClaimIds.includes(ref)) ? { ...record, resolvedById: next.id } : record),
    { ...next, ...(previous ? { supersedesId: previous.id, ...(previous.paused ? { paused: true } : {}) } : {}) }];
}
export function acceptLifeEpisode(input: unknown, scope: CharacterTruthScope, now: number, id: string, userNames: readonly string[],
  allowedPeople: readonly { id: string; name: string }[] = [], completionSubject?: string): CharacterLifeEpisode | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  const participantIds = Array.isArray(value.participantIds) ? value.participantIds : [];
  if (participantIds.length > 3 || participantIds.some((ref) => typeof ref !== "string" || !allowedPeople.some((person) => person.id === ref))) return undefined;
  if (typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 400
    || !["completed", "planned"].includes(value.status as string)
    || /用户|对方|我们|见你|找你|给你|和你|你家|你的|你说/u.test(value.summary)
    || !participantIds.length && /一起|他|她/u.test(value.summary)
    || participantIds.some((ref) => !value.summary!.toString().includes(allowedPeople.find((person) => person.id === ref)!.name))
    || userNames.filter(Boolean).some((name) => value.summary!.toString().includes(name))) return undefined;
  const activity = proposeLifeActivity(value.activity, value.summary, id, value.status === "completed");
  if (value.activity !== undefined && !activity) return undefined;
  if(value.status==="completed"&&isExplicitLifeStepFailure(value.summary,completionSubject||activity?.steps[0]||value.summary))return undefined;
  if (value.scheduleSlot !== undefined && (!isLifeScheduleSlot(value.scheduleSlot)
    || value.status === "completed" && (value.scheduleSlot.endAt > now || value.scheduleSlot.startAt < now - 6 * 60 * 60_000)
    || value.status === "planned" && (value.scheduleSlot.startAt < now || value.scheduleSlot.endAt > now + 7 * 86400_000))) return undefined;
  // Foreground simulation can establish only a bounded solo episode, never a shared user event.
  return { id, characterId: scope.characterId, userIdentityId: scope.userIdentityId,
    summary: value.summary.trim(), occurredAt: now, recordedAt: now,
    status: value.status as "completed" | "planned", origin: "foreground_simulation", private: true,
    ...(activity ? { activity } : {}),
    ...(isLifeScheduleSlot(value.scheduleSlot) ? { scheduleSlot: { ...value.scheduleSlot } } : {}),
    ...(participantIds.length ? { participantIds: participantIds as string[] } : {}) };
}

/** A recorded fictional plan changes only through an explicit scoped continuation. Original text is retained. */
export function applyLifeContinuation(records: readonly CharacterLifeEpisode[], input: unknown, scope: CharacterTruthScope,
  now: number, id: string, userNames: readonly string[], allowedPeople: readonly { id: string; name: string }[] = [], independentlyReviewed = false): CharacterLifeEpisode[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [...records];
  const value = input as Record<string, unknown>;
  const previous = records.find((record) => record.id === value.previousEpisodeId && record.characterId === scope.characterId
    && record.userIdentityId === scope.userIdentityId && record.status === "planned" && !record.supersededById && record.recordedAt <= now);
  if (!previous || records.some((record) => record.id === id)) return [...records];
  const status = value.status;
  if (status !== "completed" && status !== "cancelled" && status !== "progressed") return [...records];
  if (typeof value.summary !== "string" || !independentlyReviewed && status !== "cancelled" && !isLifeCompletionCompatible(previous.activity?.steps[previous.activity.progress] || previous.summary, value.summary,
    allowedPeople.filter((person) => previous.participantIds?.includes(person.id)).map((person) => person.name))) return [...records];
  if(status!=="cancelled"&&isExplicitLifeStepFailure(value.summary,previous.activity?.steps[previous.activity.progress]||previous.summary))return [...records];
  if (status === "cancelled" && !independentlyReviewed && !/取消|放弃|不再|作罢|推迟|改天|延期/u.test(value.summary)) return [...records];
  const next = acceptLifeEpisode({ summary: value.summary, status: status === "cancelled" ? "planned" : "completed", participantIds: previous.participantIds || [] }, scope, now, id, userNames, allowedPeople, previous.activity?.steps[previous.activity.progress] || previous.summary);
  if (!next) return [...records];
  // A future appointment is not evidence of completion; only a newly generated,
  // bounded foreground result can occupy an actual interval.
  if (previous.scheduleSlot && now < previous.scheduleSlot.startAt && status !== "cancelled") return [...records];
  if (value.scheduleSlot !== undefined) {
    if (!isLifeScheduleSlot(value.scheduleSlot) || value.scheduleSlot.endAt > now
      || value.scheduleSlot.startAt < now - 6 * 60 * 60_000) return [...records];
    next.scheduleSlot = { ...value.scheduleSlot };
  }
  if (!canScheduleLife({ ...next, status }, records, previous.id)) return [...records];
  let activity = previous.activity;
  if (activity && status !== "cancelled") {
    activity = advanceLifeActivity(activity, value.stepIndex, value.effects);
    if (!activity || status === "completed" && activity.progress !== activity.steps.length
      || status === "progressed" && activity.progress >= activity.steps.length) return [...records];
  } else if (status === "progressed") return [...records];
  return [...records.map((record) => record.id === previous.id ? { ...record, supersededById: id } : record),
    { ...next, status: status === "progressed" ? "planned" : status, previousEpisodeId: previous.id, ...(activity ? { activity } : {}) }];
}
export function selectCharacterContinuityContext(store: CharacterContinuityStore, scope: CharacterTruthScope, claims: readonly KnowledgeClaim[], query: string, now: number, budget = 1000, semanticScores?: ReadonlyMap<string, number>,
  options: { queryConstraints?: MemoryQueryConstraints; alreadyPromptedMessageIds?: readonly string[]; alreadyPromptedTexts?: readonly string[];cooledIds?:ReadonlySet<string>;cooldownCue?:string } = {}): string {
  const historical = asksForHistory(query);
  const constraints = options.queryConstraints || inferMemoryQueryConstraints(query, claims.filter((claim) => isExactTruthScope(claim, scope)));
  const recentIds = new Set(options.alreadyPromptedMessageIds || []);
  const repeatedText = (text: string) => (options.alreadyPromptedTexts || []).some((recent) => recent.normalize("NFKC").replace(/\s/gu, "").includes(text.normalize("NFKC").replace(/\s/gu, "")));
  const asksAboutImpression = /怎么看我|如何看待我|对我.{0,8}(?:印象|看法|认识)|了解我|你眼中的我|(?:view|opinion|impression) of me/iu.test(query);
  const impressions = reconcileImpressions(store.impressions, claims, now)
    .filter((record) => isExactTruthScope(record.scope, scope) && record.recordedAt <= now && !record.paused && (record.status === "active"
      && (record.intervention || record.sourceClaimIds.every((id) => claims.some((claim) =>
        (claim.id === id || claim.mergedClaimIds?.includes(id)) && eligibleImpressionEvidence(claim, scope, now))))
      || historical && record.status === "superseded" && eligibleHistoricalImpression(record, claims, now)))
    .filter((record) => !repeatedText(record.proposition) && (!constraints.entityId || record.sourceClaimIds.some((id) => claims.some((claim) => claim.id === id && matchesMemoryQueryConstraints(claim, constraints))))
      && (!constraints.eventDate || new Date(record.recordedAt).toISOString().slice(0, 10) === constraints.eventDate)
      && !(record.sourceClaimIds.length && record.sourceClaimIds.every((id) => claims.some((claim) => (claim.id === id || claim.mergedClaimIds?.includes(id))
        && claim.source.messageIds?.length && claim.source.messageIds.every((sourceId) => recentIds.has(sourceId))))))
    .filter((record) => asksAboutImpression || memoryRelevance(`${record.category} ${record.proposition}`, query) > 0 || (semanticScores?.get(`impression:${record.id}`) ?? 0) > 0)
    .sort((a, b) => ((semanticScores?.get(`impression:${b.id}`) ?? 0) * 20 + memoryRelevance(b.proposition, query))
      - ((semanticScores?.get(`impression:${a.id}`) ?? 0) * 20 + memoryRelevance(a.proposition, query)) || b.recordedAt - a.recordedAt).slice(0, 2);
  const life = store.life.filter((record) => record.characterId === scope.characterId && record.userIdentityId === scope.userIdentityId && record.recordedAt <= now
    && !repeatedText(record.summary) && !constraints.entityId
    && (!constraints.eventDate || new Date(record.occurredAt).toISOString().slice(0, 10) === constraints.eventDate)
    && (!record.supersededById || historical) && (["completed", "planned"].includes(record.status) || historical && record.status === "cancelled") && record.occurredAt <= now)
    .filter((record) => /今天|最近|在干|做什么|忙什么|怎么样|生活/u.test(query) || memoryRelevance(record.summary, query) > 0 || (semanticScores?.get(`life:${record.id}`) ?? 0) > 0)
    .sort((a, b) => ((semanticScores?.get(`life:${b.id}`) ?? 0) * 20 + memoryRelevance(b.summary, query))
      - ((semanticScores?.get(`life:${a.id}`) ?? 0) * 20 + memoryRelevance(a.summary, query)) || b.occurredAt - a.occurredAt).slice(0, 2);
  let text = "";
  const currentState = store.lifeStates?.find(state=>state.characterId===scope.characterId&&state.userIdentityId===scope.userIdentityId);
  if(!historical&&currentState&&currentState.lastAdvancedAt<=now&&now-currentState.lastAdvancedAt<=86400_000
    &&store.life.some(episode=>episode.characterId===scope.characterId&&episode.userIdentityId===scope.userIdentityId&&episode.recordedAt===currentState.lastAdvancedAt)
    &&(currentState.energy<=.3||currentState.stress>=.75)) {
    const stateLine=`\n[自身虚拟生活形成的近期状态] ${currentState.energy<=.3?"精力较低，表达节奏可稍缓。":""}${currentState.stress>=.75?"压力偏高，语气可略克制。":""}只轻微影响表达，不强迫提起生活，不归因于用户，不编造原因；不是关系变化。`;
    if(stateLine.length<=budget)text=stateLine;
  }
  for (const record of impressions) {
    const growth = record.growth && Object.entries(record.growth).map(([dimension, delta]) => `${dimension} ${Number(delta) > 0 ? "略增" : Number(delta) < 0 ? "略降" : "不变"}`).join("、");
    const line = record.status !== "active" ? `\n[过去形成的主观认识，非当前认识] ${new Date(record.recordedAt).toISOString()}：${record.proposition}。只解释当时看法，不改变当前行为，不得当作客观事实。`
      : `\n[角色主观认识，可能误解${record.intervention ? "，用户干预" : ""}] ${record.proposition}。${growth ? `行为倾向：${growth}；不改变关系身份。` : ""}只在相关时影响理解，不要机械复述，不得当作客观事实。`;
    const cooldown=options.cooledIds?.has(`impression:${record.id}`)?`\n[使用冷却] ${options.cooldownCue||"近期已经表达，避免主动重复；明确追问可接续。"}`:"";
    if (text.length + line.length+cooldown.length <= budget) text += line+cooldown;
  }
  for (const record of life) {
    const label = record.supersededById ? "过去的虚拟生活计划或进度，已有后续，不是当前状态" : record.status === "cancelled" ? "已取消的虚拟生活计划，未作为完成经历"
      : record.status === "planned" ? "角色自身的虚拟生活计划，尚未证明完成，不得当作已发生经历" : "角色自身已记录的虚拟生活经历，非共同经历";
    const line = `\n[${label}] ${new Date(record.occurredAt).toISOString()}：${record.summary}`;
    const activity = record.activity ? `；持续目标：${record.activity.goal}，进度 ${record.activity.progress}/${record.activity.steps.length}${record.activity.progress?`，已完成步骤 ${record.activity.steps.slice(0,record.activity.progress).join("、")}`:""}${record.status === "planned" ? `，下一步 ${record.activity.steps[record.activity.progress]}` : ""}；精力 ${record.activity.energy.toFixed(2)}，压力 ${record.activity.stress.toFixed(2)}${record.activity.friction ? `；尚在应对：${record.activity.friction}` : ""}` : "";
    const slot = record.scheduleSlot ? `；${record.status === "planned" ? "预约" : "模拟活动"}时段 ${new Date(record.scheduleSlot.startAt).toISOString()} 至 ${new Date(record.scheduleSlot.endAt).toISOString()}${record.scheduleSlot.location ? `，地点 ${record.scheduleSlot.location}` : "，地点未记录"}` : "";
    const cooldown=options.cooledIds?.has(`life:${record.id}`)?`\n[使用冷却] ${options.cooldownCue||"近期已经表达，避免主动重复；明确追问可接续。"}`:"";
    if (text.length + line.length + activity.length + slot.length+cooldown.length <= budget) text += line + activity + slot+cooldown;
  }
  return text;
}
