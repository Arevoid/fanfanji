import type { CharacterLifeScope } from "./characterLifeTypes";

export const CHARACTER_EVENT_SCHEMA_VERSION = 1;

/** Event kinds and sources stay open so new applications do not need to edit this foundation. */
export type CharacterEventKind = string;
export type CharacterEventSource = string;
export type CharacterEventStatus = string;
export type CharacterEventVisibility = "private" | "shared" | "public" | "character_private" | "user_private";

export interface CharacterEventInterval {
  startAt: number;
  endAt?: number;
}

export interface CharacterEvent extends CharacterLifeScope {
  id: string;
  kind: CharacterEventKind;
  /** Optional event-runtime vocabulary; kind remains the legacy canonical field. */
  type?: CharacterEventKind;
  summary: string;
  source: CharacterEventSource;
  occurredAt: number;
  timestamp?: number;
  interval?: CharacterEventInterval;
  participants?: readonly string[];
  visibility?: CharacterEventVisibility;
  refs?: readonly string[];
  recordedAt: number;
  confidence: number;
  status: CharacterEventStatus;
  schemaVersion: number;
}

/** Input accepted by event producers; storage timestamps and schema version are normalized centrally. */
export type CharacterEventInput = Omit<CharacterEvent, "recordedAt" | "schemaVersion"> & {
  recordedAt?: number;
  schemaVersion?: number;
};
