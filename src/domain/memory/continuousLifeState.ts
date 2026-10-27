/** Durable state is reduced from committed events, never accepted as a model-authored snapshot. */
export interface ContinuousLifeState {
  characterId: string; userIdentityId: string; energy: number; stress: number; lastAdvancedAt: number; paused: boolean;
  activeGoalId?: string; interests: string[]; habits: { name: string; sourceEpisodeId: string }[];
  openConcerns: { text: string; sourceEpisodeId: string }[];
  schedule: { activity: string; sourceEpisodeId: string; status: "planned" | "completed" | "cancelled" }[];
}
export interface LifeWitness { npcId: string; ownerCharacterId: string; userIdentityId: string; sourceEpisodeId: string; acquiredAt: number }
interface LifeEvent {
  id: string; characterId: string; userIdentityId: string; recordedAt: number; occurredAt: number; summary: string;
  status: "planned" | "completed" | "cancelled"; previousEpisodeId?: string; supersededById?: string; participantIds?: string[];
  activity?: { goalId: string; goal: string; kind: string; energy: number; stress: number; friction?: string };
}
export const initialLifeState = (characterId: string, userIdentityId: string): ContinuousLifeState => ({ characterId, userIdentityId,
  energy: .6, stress: .3, lastAdvancedAt: 0, paused: false, interests: [], habits: [], openConcerns: [], schedule: [] });
export function isContinuousLifeState(raw: unknown): raw is ContinuousLifeState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = raw as ContinuousLifeState;
  return typeof value.characterId === "string" && typeof value.userIdentityId === "string" && typeof value.paused === "boolean"
    && [value.energy, value.stress].every((amount) => Number.isFinite(amount) && amount >= 0 && amount <= 1)
    && Number.isFinite(value.lastAdvancedAt) && (value.activeGoalId === undefined || typeof value.activeGoalId === "string")
    && Array.isArray(value.interests) && value.interests.every((text) => typeof text === "string")
    && Array.isArray(value.habits) && value.habits.every((item) => item && typeof item.name === "string" && typeof item.sourceEpisodeId === "string")
    && Array.isArray(value.openConcerns) && value.openConcerns.every((item) => item && typeof item.text === "string" && typeof item.sourceEpisodeId === "string")
    && Array.isArray(value.schedule) && value.schedule.every((item) => item && typeof item.activity === "string" && typeof item.sourceEpisodeId === "string"
      && ["planned", "completed", "cancelled"].includes(item.status));
}
export function reduceContinuousLife<T extends LifeEvent>(input: { states: readonly ContinuousLifeState[]; witnesses: readonly LifeWitness[];
  previous: readonly T[]; next: readonly T[]; characterId: string; userIdentityId: string; authorizedNpcIds: readonly string[] }) {
  const sameOwner = (record: { characterId: string; userIdentityId: string }) => record.characterId === input.characterId && record.userIdentityId === input.userIdentityId;
  const state = structuredClone(input.states.find(sameOwner) || initialLifeState(input.characterId, input.userIdentityId));
  const previousIds = new Set(input.previous.map((record) => record.id)); const life = [...input.next];
  const witnesses = input.witnesses.filter((record) => record.ownerCharacterId !== input.characterId || record.userIdentityId !== input.userIdentityId
    || input.authorizedNpcIds.includes(record.npcId));
  for (const event of life.filter((record) => sameOwner(record) && !previousIds.has(record.id)).sort((a, b) => a.recordedAt - b.recordedAt)) {
    if (event.activity) {
      const prior = input.previous.find((record) => record.id === event.previousEpisodeId && sameOwner(record));
      state.energy = Math.max(0, Math.min(1, state.energy + (prior?.activity ? event.activity.energy - prior.activity.energy : 0)));
      state.stress = Math.max(0, Math.min(1, state.stress + (prior?.activity ? event.activity.stress - prior.activity.stress : 0)));
      const position = life.findIndex((record) => record.id === event.id);
      life[position] = { ...event, activity: { ...event.activity, energy: state.energy, stress: state.stress } };
      if (event.activity.kind === "hobby" && !state.interests.includes(event.activity.goal)) state.interests.push(event.activity.goal);
      if (event.activity.kind === "habit" && !state.habits.some((record) => record.name === event.activity!.goal))
        state.habits.push({ name: event.activity.goal, sourceEpisodeId: event.id });
      if (event.activity.friction && !state.openConcerns.some((record) => record.text === event.activity!.friction))
        state.openConcerns.push({ text: event.activity.friction, sourceEpisodeId: event.id });
      if (event.status === "completed" || event.status === "cancelled") {
        const goalRecords = new Set(life.filter((record) => sameOwner(record) && record.activity?.goalId === event.activity!.goalId).map((record) => record.id));
        state.openConcerns = state.openConcerns.filter((record) => !goalRecords.has(record.sourceEpisodeId));
      }
    }
    state.lastAdvancedAt = Math.max(state.lastAdvancedAt, event.recordedAt);
    if (event.status === "completed") for (const npcId of event.participantIds || [])
      if (input.authorizedNpcIds.includes(npcId) && !witnesses.some((record) => record.npcId === npcId && record.sourceEpisodeId === event.id && record.userIdentityId === event.userIdentityId))
        witnesses.push({ npcId, ownerCharacterId: event.characterId, userIdentityId: event.userIdentityId, sourceEpisodeId: event.id, acquiredAt: event.occurredAt });
  }
  const owned = life.filter(sameOwner);
  state.schedule = owned.filter((record) => record.activity && !record.supersededById).map((record) => ({ activity: record.activity!.goal, sourceEpisodeId: record.id, status: record.status }));
  state.activeGoalId = owned.find((record) => record.status === "planned" && !record.supersededById && record.activity?.goalId === state.activeGoalId)?.activity?.goalId
    || owned.find((record) => record.status === "planned" && !record.supersededById && record.activity)?.activity?.goalId;
  const ids = new Set(life.map((record) => record.id));
  return { states: [...input.states.filter((record) => !sameOwner(record)), state], life,
    witnesses: witnesses.filter((record) => ids.has(record.sourceEpisodeId)) };
}
/** An NPC gets only the exact shared event, never the owner's private facts, impressions or whole life. */
export function selectNpcLifeKnowledge<T extends LifeEvent>(witnesses: readonly LifeWitness[], life: readonly T[], npcId: string, userIdentityId: string, authorizedOwnerIds: readonly string[]): T[] {
  const ids = new Set(witnesses.filter((record) => record.npcId === npcId && record.userIdentityId === userIdentityId && authorizedOwnerIds.includes(record.ownerCharacterId)).map((record) => record.sourceEpisodeId));
  return life.filter((record) => ids.has(record.id) && record.userIdentityId === userIdentityId && record.status === "completed" && record.participantIds?.includes(npcId));
}
