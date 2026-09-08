import type { Character, Message, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { DirectReplyMode, DirectReplyPostReplyPolicy } from "../contracts/directReplyLifecycle";
import type { ChatReplySideEffectInput } from "./chatSideEffectController";

export interface PostReplyDiaryRequest {
  relation: CharacterRelationship;
  character: Character;
  ownerIdentityId: string;
  messages: readonly Message[];
  worldBookEntries?: readonly WorldBookEntry[];
  settings: UserSettings;
}

export type PostReplyScheduledAction = "reply_side_effects" | "diary";
export type PostReplyFailureStage = "reply_side_effects" | "diary";

export interface PostReplyCoordinatorInput {
  mode: DirectReplyMode;
  policy: DirectReplyPostReplyPolicy;
  sideEffects: ChatReplySideEffectInput;
  diary?: PostReplyDiaryRequest;
}

export interface PostReplyCoordinatorDependencies {
  runReplySideEffects: (input: ChatReplySideEffectInput) => void;
  scheduleDiary?: (input: PostReplyDiaryRequest) => void | Promise<void>;
}

export interface PostReplyCoordinatorOutcome {
  mode: DirectReplyMode;
  policy: DirectReplyPostReplyPolicy;
  scheduled: readonly PostReplyScheduledAction[];
  failures: readonly PostReplyFailureStage[];
}

/**
 * Small adapter boundary around existing post-reply services. It does not
 * implement Memory, Diary, Moments, offline or phone logic; it only decides
 * which already-owned service entry points are eligible for this lifecycle.
 * Failure is reported as metadata and never thrown back into main delivery.
 */
export function createPostReplyCoordinator(dependencies: PostReplyCoordinatorDependencies) {
  return {
    schedule(input: PostReplyCoordinatorInput): PostReplyCoordinatorOutcome {
      if (input.policy === "regenerate_none" || input.mode === "regenerate") {
        return { mode: input.mode, policy: input.policy, scheduled: [], failures: [] };
      }

      const scheduled: PostReplyScheduledAction[] = [];
      const failures: PostReplyFailureStage[] = [];

      try {
        dependencies.runReplySideEffects(input.sideEffects);
        scheduled.push("reply_side_effects");
      } catch {
        failures.push("reply_side_effects");
      }

      if (input.diary && dependencies.scheduleDiary) {
        try {
          const scheduledDiary = dependencies.scheduleDiary(input.diary);
          if (scheduledDiary && typeof scheduledDiary.then === "function") {
            void scheduledDiary.catch(() => undefined);
          }
          scheduled.push("diary");
        } catch {
          failures.push("diary");
        }
      }

      return { mode: input.mode, policy: input.policy, scheduled, failures };
    },
  };
}
