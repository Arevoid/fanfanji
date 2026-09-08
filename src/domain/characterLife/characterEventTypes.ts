import type { CharacterLifeScope } from "./characterLifeTypes";

export const CHARACTER_EVENT_SCHEMA_VERSION = 1;

/** Event kinds and sources stay open so new applications do not need to edit this foundation. */
export type CharacterEventKind = string;
export type CharacterEventSource = string;
export type CharacterEventStatus = string;

export interface CharacterEvent extends CharacterLifeScope {
  id: string;
  kind: CharacterEventKind;
  summary: string;
  source: CharacterEventSource;
  occurredAt: number;
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
