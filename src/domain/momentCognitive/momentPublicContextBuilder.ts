import {
  MOMENT_PUBLIC_COGNITIVE_CONTEXT_SCHEMA_VERSION,
  type BuildMomentPublicCognitiveContextInput,
  type MomentPublicCharacterProfile,
  type MomentPublicCognitiveContext,
  type MomentPublicTimeContext,
} from "./momentPublicCognitiveTypes";
import {
  selectAuthorizedPublicFacts,
  selectPublicBehaviorConstraints,
  selectPublicMomentComments,
  selectPublicMomentEvents,
  selectPublicMomentHistory,
} from "./momentPublicVisibilityPolicy";

function projectPublicCharacterProfile(
  character: BuildMomentPublicCognitiveContextInput["character"],
): MomentPublicCharacterProfile {
  return {
    name: character.name,
    ...(character.age === undefined ? {} : { age: character.age }),
    ...(character.gender === undefined ? {} : { gender: character.gender }),
    ...(character.mbti === undefined ? {} : { mbti: character.mbti }),
    personality: character.personality,
    backstory: character.backstory,
  };
}

function projectCurrentTime(
  currentTime: BuildMomentPublicCognitiveContextInput["currentTime"],
): MomentPublicTimeContext {
  const iso = new Date(currentTime.now).toISOString();
  return {
    now: currentTime.now,
    date: currentTime.date || iso.slice(0, 10),
    time: currentTime.time || iso.slice(11, 16),
    ...(currentTime.timezone ? { timezone: currentTime.timezone } : {}),
    ...(currentTime.period ? { period: currentTime.period } : {}),
  };
}

/** Pure, deny-by-default builder for the Moment public-expression domain. */
export function buildMomentPublicCognitiveContext(
  input: BuildMomentPublicCognitiveContextInput,
): MomentPublicCognitiveContext {
  const characterId = input.character.id;
  return {
    schemaVersion: MOMENT_PUBLIC_COGNITIVE_CONTEXT_SCHEMA_VERSION,
    createdAt: input.currentTime.now,
    publicCharacterProfile: projectPublicCharacterProfile(input.character),
    publicMomentHistory: selectPublicMomentHistory(input.publicMomentHistory || [], characterId),
    publicCommentHistory: selectPublicMomentComments(input.publicCommentHistory || [], characterId),
    authorizedPublicFacts: selectAuthorizedPublicFacts(input.publicFacts || [], characterId),
    publicEvents: selectPublicMomentEvents(input.publicEvents || [], characterId),
    publicBehaviorConstraints: selectPublicBehaviorConstraints(input.publicBehaviorConstraints || []),
    currentTime: projectCurrentTime(input.currentTime),
  };
}
