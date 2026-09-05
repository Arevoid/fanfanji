import { isCompleteScheduleScope, isNonEmptyScheduleId } from "./scheduleScope";
import {
  SCHEDULE_SCHEMA_VERSION,
  type Appointment,
  type AppointmentProposal,
  type AppointmentStatus,
} from "./scheduleTypes";

const APPOINTMENT_STATUSES = new Set<AppointmentStatus>([
  "draft", "awaiting_user", "negotiating", "confirmed", "preparing", "ready",
  "in_progress", "completed", "declined", "cancelled", "expired",
]);
const PROPOSAL_STATUSES = new Set(["active", "superseded", "rejected"]);
const TIME_PRECISIONS = new Set(["exact", "morning", "afternoon", "evening", "date_only", "undetermined"]);
const ACTORS = new Set(["character", "user", "both", "undetermined"]);

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isOptionalFiniteNumber = (value: unknown): boolean => value === undefined || isFiniteNumber(value);
const isOptionalString = (value: unknown): boolean => value === undefined || typeof value === "string";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isNonEmptyScheduleId);

export const normalizeAppointmentProposal = (value: unknown): AppointmentProposal | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const proposal = value as Partial<AppointmentProposal>;
  if (!isNonEmptyScheduleId(proposal.id)
    || (proposal.proposedBy !== "character" && proposal.proposedBy !== "user")
    || !isFiniteNumber(proposal.proposedAt)
    || !isOptionalFiniteNumber(proposal.startAt)
    || !isOptionalFiniteNumber(proposal.endAt)
    || typeof proposal.timePrecision !== "string" || !TIME_PRECISIONS.has(proposal.timePrecision)
    || !isOptionalString(proposal.activity)
    || !isOptionalString(proposal.location)
    || typeof proposal.traveler !== "string" || !ACTORS.has(proposal.traveler)
    || !isOptionalString(proposal.transport)
    || typeof proposal.status !== "string" || !PROPOSAL_STATUSES.has(proposal.status)
    || !isStringArray(proposal.sourceMessageIds)) return undefined;

  return {
    id: proposal.id.trim(),
    proposedBy: proposal.proposedBy,
    proposedAt: proposal.proposedAt,
    ...(proposal.startAt === undefined ? {} : { startAt: proposal.startAt }),
    ...(proposal.endAt === undefined ? {} : { endAt: proposal.endAt }),
    timePrecision: proposal.timePrecision,
    ...(proposal.activity?.trim() ? { activity: proposal.activity.trim() } : {}),
    ...(proposal.location?.trim() ? { location: proposal.location.trim() } : {}),
    traveler: proposal.traveler,
    ...(proposal.transport?.trim() ? { transport: proposal.transport.trim() } : {}),
    status: proposal.status,
    sourceMessageIds: [...new Set(proposal.sourceMessageIds.map((id) => id.trim()))],
  };
};

export const normalizeAppointment = (value: unknown): Appointment | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const appointment = value as Partial<Appointment>;
  if (!isCompleteScheduleScope(appointment)
    || !isNonEmptyScheduleId(appointment.id)
    || appointment.schemaVersion !== SCHEDULE_SCHEMA_VERSION
    || !isNonEmptyScheduleId(appointment.title)
    || (appointment.initiator !== "character" && appointment.initiator !== "user")
    || (appointment.mode !== "immediate" && appointment.mode !== "scheduled")
    || typeof appointment.status !== "string" || !APPOINTMENT_STATUSES.has(appointment.status)
    || !Array.isArray(appointment.proposals)
    || !isStringArray(appointment.sourceMessageIds)
    || !isOptionalString(appointment.currentProposalId)
    || !isOptionalFiniteNumber(appointment.confirmedAt)
    || !isFiniteNumber(appointment.createdAt)
    || !isFiniteNumber(appointment.updatedAt)) return undefined;

  const proposals = appointment.proposals.map(normalizeAppointmentProposal);
  if (proposals.some((proposal) => proposal === undefined)) return undefined;
  const normalizedProposals = proposals as AppointmentProposal[];
  const proposalIds = new Set(normalizedProposals.map((proposal) => proposal.id));
  if (proposalIds.size !== normalizedProposals.length) return undefined;
  if (appointment.currentProposalId && !proposalIds.has(appointment.currentProposalId)) return undefined;
  const activeProposals = normalizedProposals.filter((proposal) => proposal.status === "active");
  if (activeProposals.length > 1) return undefined;
  if (appointment.currentProposalId && !activeProposals.some((proposal) => proposal.id === appointment.currentProposalId)) return undefined;
  if (appointment.confirmedAt !== undefined && !appointment.currentProposalId) return undefined;
  const currentProposal = appointment.currentProposalId
    ? normalizedProposals.find((proposal) => proposal.id === appointment.currentProposalId)
    : undefined;
  const confirmedLifecycle = ["confirmed", "preparing", "ready", "in_progress", "completed"].includes(appointment.status);
  if (confirmedLifecycle
    && (appointment.confirmedAt === undefined
      || !currentProposal
      || currentProposal.startAt === undefined
      || currentProposal.timePrecision === "undetermined")) return undefined;
  if ((appointment.status === "draft" || appointment.status === "awaiting_user" || appointment.status === "negotiating" || appointment.status === "declined")
    && appointment.confirmedAt !== undefined) return undefined;
  if (normalizedProposals.some((proposal) => proposal.startAt !== undefined
    && proposal.endAt !== undefined
    && proposal.endAt < proposal.startAt)) return undefined;
  const sourceMessageIds = [...new Set([
    ...appointment.sourceMessageIds.map((id) => id.trim()),
    ...normalizedProposals.flatMap((proposal) => proposal.sourceMessageIds),
  ])];

  return {
    id: appointment.id.trim(),
    schemaVersion: SCHEDULE_SCHEMA_VERSION,
    relationId: appointment.relationId.trim(),
    characterId: appointment.characterId.trim(),
    userIdentityId: appointment.userIdentityId.trim(),
    title: appointment.title.trim(),
    initiator: appointment.initiator,
    mode: appointment.mode,
    status: appointment.status,
    proposals: normalizedProposals,
    ...(appointment.currentProposalId ? { currentProposalId: appointment.currentProposalId.trim() } : {}),
    sourceMessageIds,
    ...(appointment.confirmedAt === undefined ? {} : { confirmedAt: appointment.confirmedAt }),
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
};

export const getCurrentAppointmentProposal = (appointment: Appointment): AppointmentProposal | undefined =>
  appointment.currentProposalId
    ? appointment.proposals.find((proposal) => proposal.id === appointment.currentProposalId && proposal.status === "active")
    : undefined;

export type AppointmentProposalMutationResult =
  | { success: true; appointment: Appointment }
  | { success: false; appointment: Appointment; reason: "invalid_proposal" | "duplicate_proposal" | "appointment_locked" };

/** Replaces the active proposal without preserving the old time as a live option. */
export const appendAppointmentProposal = (
  appointment: Appointment,
  input: AppointmentProposal,
  now = Date.now(),
): AppointmentProposalMutationResult => {
  if (appointment.status !== "draft" && appointment.status !== "awaiting_user" && appointment.status !== "negotiating") {
    return { success: false, appointment, reason: "appointment_locked" };
  }
  const proposal = normalizeAppointmentProposal(input);
  if (!proposal || proposal.status !== "active") {
    return { success: false, appointment, reason: "invalid_proposal" };
  }
  if (appointment.proposals.some((item) => item.id === proposal.id)) {
    return { success: false, appointment, reason: "duplicate_proposal" };
  }
  return {
    success: true,
    appointment: {
      ...appointment,
      status: proposal.proposedBy === "character" ? "awaiting_user" : "negotiating",
      proposals: [
        ...appointment.proposals.map((item) => item.status === "active" ? { ...item, status: "superseded" as const } : item),
        proposal,
      ],
      currentProposalId: proposal.id,
      sourceMessageIds: [...new Set([...appointment.sourceMessageIds, ...proposal.sourceMessageIds])],
      updatedAt: now,
    },
  };
};

export const canConfirmAppointment = (appointment: Appointment): boolean => {
  const proposal = getCurrentAppointmentProposal(appointment);
  return Boolean(proposal
    && proposal.startAt !== undefined
    && proposal.timePrecision !== "undetermined"
    && (appointment.status === "awaiting_user" || appointment.status === "negotiating"));
};

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  draft: ["awaiting_user", "cancelled"],
  awaiting_user: ["negotiating", "confirmed", "declined", "cancelled", "expired"],
  negotiating: ["awaiting_user", "confirmed", "declined", "cancelled", "expired"],
  confirmed: ["preparing", "cancelled", "expired"],
  preparing: ["ready", "cancelled", "expired"],
  ready: ["in_progress", "cancelled", "expired"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  declined: [],
  cancelled: [],
  expired: [],
};

export interface AppointmentTransitionResult {
  success: boolean;
  appointment: Appointment;
  reason?: "invalid_transition" | "confirmation_incomplete";
}

export const transitionAppointment = (
  appointment: Appointment,
  nextStatus: AppointmentStatus,
  now = Date.now(),
): AppointmentTransitionResult => {
  if (!ALLOWED_TRANSITIONS[appointment.status].includes(nextStatus)) {
    return { success: false, appointment, reason: "invalid_transition" };
  }
  if (nextStatus === "confirmed" && !canConfirmAppointment(appointment)) {
    return { success: false, appointment, reason: "confirmation_incomplete" };
  }
  return {
    success: true,
    appointment: {
      ...appointment,
      status: nextStatus,
      updatedAt: now,
      ...(nextStatus === "confirmed" ? { confirmedAt: now } : {}),
    },
  };
};
