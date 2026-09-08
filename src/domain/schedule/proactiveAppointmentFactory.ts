import type { ProactiveOfflineInvitationDirective } from "../../features/chat/services/proactiveOfflineInvitationProtocol";
import { isCompleteScheduleScope, isNonEmptyScheduleId } from "./scheduleScope";
import { SCHEDULE_SCHEMA_VERSION, type Appointment, type ScheduleScope } from "./scheduleTypes";

/** Creates a pending proposal only. User acceptance must arrive in a later user-authored message. */
export function createProactiveAppointment(input: {
  id: string;
  proposalId: string;
  scope: ScheduleScope;
  directive: ProactiveOfflineInvitationDirective;
  sourceMessageId: string;
  now?: number;
}): Appointment {
  if (!isNonEmptyScheduleId(input.id)
    || !isNonEmptyScheduleId(input.proposalId)
    || !isNonEmptyScheduleId(input.sourceMessageId)
    || !isCompleteScheduleScope(input.scope)) {
    throw new Error("A proactive appointment requires complete relationship scope and source IDs.");
  }
  const now = input.now ?? Date.now();
  const proposal = {
    id: input.proposalId,
    proposedBy: "character" as const,
    proposedAt: now,
    ...(input.directive.startAt === undefined ? {} : { startAt: input.directive.startAt }),
    timePrecision: input.directive.timePrecision,
    ...(input.directive.activity ? { activity: input.directive.activity } : {}),
    ...(input.directive.location ? { location: input.directive.location } : {}),
    traveler: input.directive.traveler,
    ...(input.directive.transport ? { transport: input.directive.transport } : {}),
    status: "active" as const,
    sourceMessageIds: [input.sourceMessageId],
  };
  return {
    ...input.scope,
    id: input.id,
    schemaVersion: SCHEDULE_SCHEMA_VERSION,
    title: input.directive.activity || "线下见面",
    initiator: "character",
    mode: input.directive.mode,
    status: "awaiting_user",
    proposals: [proposal],
    currentProposalId: proposal.id,
    sourceMessageIds: [input.sourceMessageId],
    createdAt: now,
    updatedAt: now,
  };
}
