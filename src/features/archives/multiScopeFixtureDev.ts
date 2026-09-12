import { createId } from "../../core/id/createId";
import type { UserIdentity, UserSettings } from "../../types";
import {
  SYNTHETIC_IDENTITY_BIO,
  fingerprintCanonicalId,
  type CharacterOwnershipBootstrapOptions,
  type CharacterOwnershipBootstrapResult,
} from "./characterOwnershipBootstrapDev";
import type {
  DedicatedRelationBootstrapOptions,
  DedicatedRelationInspectorResult,
} from "./dedicatedRelationBootstrapDev";

export const MULTI_SCOPE_FIXTURE_GLOBAL = "__fanfanjiMultiScopeFixture" as const;
export const MULTI_SCOPE_FIXTURE_IDS = [
  "stage4d3-portable-a",
  "stage4d3-portable-b",
  "stage4d3-portable-c",
] as const;

type MultiScopeFixtureId = typeof MULTI_SCOPE_FIXTURE_IDS[number];

export type MultiScopeFixtureStatus =
  | "MULTI_SCOPE_FIXTURE_READY_VALIDATED"
  | "MULTI_SCOPE_FIXTURE_ID_INVALID"
  | "MULTI_SCOPE_FIXTURE_IDENTITY_BLOCKED"
  | "MULTI_SCOPE_FIXTURE_CHARACTER_BLOCKED"
  | "MULTI_SCOPE_FIXTURE_RELATION_BLOCKED";

export interface MultiScopeFixtureBootstrapOptions {
  fixtureId: MultiScopeFixtureId;
  identityName?: string;
  characterName?: string;
}

export interface MultiScopeFixtureResult {
  status: MultiScopeFixtureStatus;
  fixtureId: MultiScopeFixtureId | string;
  synthetic: true;
  exactScopeHealth: boolean;
  identityFingerprint: string | null;
  characterFingerprint: string | null;
  relationFingerprint: string | null;
  conversationFingerprint: string | null;
  triggerCount: number;
  eligibleMessageCount: number;
  distanceToTrigger: number;
  archiveMarkerPresent: boolean;
}

interface MultiScopeFixtureDependencies {
  getSettings: () => UserSettings;
  saveSettings: (update: (previous: UserSettings) => UserSettings) => boolean;
  bootstrapCharacter: (options?: CharacterOwnershipBootstrapOptions) => Promise<CharacterOwnershipBootstrapResult>;
  inspectCharacter: (options?: CharacterOwnershipBootstrapOptions) => Promise<CharacterOwnershipBootstrapResult>;
  bootstrapRelation: (options?: DedicatedRelationBootstrapOptions) => Promise<DedicatedRelationInspectorResult>;
  inspectRelation: (options?: DedicatedRelationBootstrapOptions) => Promise<DedicatedRelationInspectorResult>;
}

const isMultiScopeFixtureId = (value: string): value is MultiScopeFixtureId =>
  (MULTI_SCOPE_FIXTURE_IDS as readonly string[]).includes(value);

const emptyResult = (fixtureId: string, status: MultiScopeFixtureStatus): MultiScopeFixtureResult => ({
  status,
  fixtureId,
  synthetic: true,
  exactScopeHealth: false,
  identityFingerprint: null,
  characterFingerprint: null,
  relationFingerprint: null,
  conversationFingerprint: null,
  triggerCount: 20,
  eligibleMessageCount: 0,
  distanceToTrigger: 20,
  archiveMarkerPresent: false,
});

function findIdentity(settings: UserSettings, fixtureId: MultiScopeFixtureId): UserIdentity | undefined {
  const matches = (settings.identities || []).filter((identity) => identity.kind !== "alias"
    && !identity.archived
    && identity.syntheticFixtureId === fixtureId
    && identity.bio.trim() === SYNTHETIC_IDENTITY_BIO);
  return matches.length === 1 ? matches[0] : undefined;
}

function createIdentity(settings: UserSettings, fixtureId: MultiScopeFixtureId, identityName: string): UserIdentity {
  const id = createId("stage4d3-multiscope-identity");
  return {
    id,
    syntheticFixtureId: fixtureId,
    name: identityName,
    avatar: "",
    signature: "Synthetic-only multi-scope Direct Chat fixture",
    bio: SYNTHETIC_IDENTITY_BIO,
    kind: "primary",
    rootIdentityId: id,
    sortOrder: (settings.identities || []).length,
  };
}

function appendIdentity(settings: UserSettings, identity: UserIdentity): UserSettings {
  const identities = settings.identities || [];
  if (identities.some((candidate) => candidate.id === identity.id)) return settings;
  return {
    ...settings,
    identities: [...identities, identity],
    identityDataVersion: Math.max(2, Number(settings.identityDataVersion) || 0),
  };
}

function resultFromInspection(
  fixtureId: MultiScopeFixtureId,
  identityFingerprint: string,
  character: CharacterOwnershipBootstrapResult,
  relation: DedicatedRelationInspectorResult,
): MultiScopeFixtureResult {
  const ready = character.status === "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED"
    && relation.status === "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED"
    && relation.exactScopeHealth;
  return {
    status: ready ? "MULTI_SCOPE_FIXTURE_READY_VALIDATED" : "MULTI_SCOPE_FIXTURE_RELATION_BLOCKED",
    fixtureId,
    synthetic: true,
    exactScopeHealth: relation.exactScopeHealth,
    identityFingerprint,
    characterFingerprint: relation.characterFingerprint,
    relationFingerprint: relation.relationFingerprint,
    conversationFingerprint: relation.conversationFingerprint,
    triggerCount: relation.triggerCount,
    eligibleMessageCount: relation.eligibleMessageCount,
    distanceToTrigger: relation.distanceToTrigger,
    archiveMarkerPresent: relation.archiveMarkerPresent,
  };
}

export function createMultiScopeFixtureApi(dependencies: MultiScopeFixtureDependencies): {
  bootstrap: (options: MultiScopeFixtureBootstrapOptions) => Promise<MultiScopeFixtureResult>;
  inspect: (options: MultiScopeFixtureBootstrapOptions) => Promise<MultiScopeFixtureResult>;
} {
  const inspect = async (options: MultiScopeFixtureBootstrapOptions): Promise<MultiScopeFixtureResult> => {
    if (!isMultiScopeFixtureId(options.fixtureId)) return emptyResult(options.fixtureId, "MULTI_SCOPE_FIXTURE_ID_INVALID");
    const identity = findIdentity(dependencies.getSettings(), options.fixtureId);
    if (!identity) return emptyResult(options.fixtureId, "MULTI_SCOPE_FIXTURE_IDENTITY_BLOCKED");
    const identityFingerprint = await fingerprintCanonicalId(identity.id);
    const character = await dependencies.inspectCharacter({
      fixtureId: options.fixtureId,
      identityId: identity.id,
      characterName: options.characterName,
    });
    if (character.status !== "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED") {
      return emptyResult(options.fixtureId, "MULTI_SCOPE_FIXTURE_CHARACTER_BLOCKED");
    }
    const relation = await dependencies.inspectRelation({
      fixtureId: options.fixtureId,
      identityId: identity.id,
    });
    return resultFromInspection(options.fixtureId, identityFingerprint, character, relation);
  };

  return {
    inspect,
    bootstrap: async (options: MultiScopeFixtureBootstrapOptions): Promise<MultiScopeFixtureResult> => {
      if (!isMultiScopeFixtureId(options.fixtureId)) return emptyResult(options.fixtureId, "MULTI_SCOPE_FIXTURE_ID_INVALID");
      const settings = dependencies.getSettings();
      let identity = findIdentity(settings, options.fixtureId);
      if (!identity) {
        identity = createIdentity(settings, options.fixtureId, options.identityName || `Stage4D3Portable ${options.fixtureId.at(-1)?.toUpperCase()} User`);
        if (!dependencies.saveSettings((previous) => appendIdentity(previous, identity!))) {
          return emptyResult(options.fixtureId, "MULTI_SCOPE_FIXTURE_IDENTITY_BLOCKED");
        }
      }

      const character = await dependencies.bootstrapCharacter({
        fixtureId: options.fixtureId,
        identityId: identity.id,
        characterName: options.characterName || `Stage4D3Portable ${options.fixtureId.at(-1)?.toUpperCase()} Character`,
      });
      if (character.status !== "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED") {
        return emptyResult(options.fixtureId, "MULTI_SCOPE_FIXTURE_CHARACTER_BLOCKED");
      }
      const relation = await dependencies.bootstrapRelation({
        fixtureId: options.fixtureId,
        identityId: identity.id,
      });
      if (relation.status !== "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED") {
        return emptyResult(options.fixtureId, "MULTI_SCOPE_FIXTURE_RELATION_BLOCKED");
      }
      return resultFromInspection(options.fixtureId, await fingerprintCanonicalId(identity.id), character, relation);
    },
  };
}

export function installMultiScopeFixtureDevApi(
  dependencies: MultiScopeFixtureDependencies,
): () => void {
  let isDev = false;
  try {
    isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    isDev = false;
  }
  if (!isDev) return () => undefined;
  const root = globalThis as typeof globalThis & {
    [MULTI_SCOPE_FIXTURE_GLOBAL]?: ReturnType<typeof createMultiScopeFixtureApi>;
  };
  const api = createMultiScopeFixtureApi(dependencies);
  root[MULTI_SCOPE_FIXTURE_GLOBAL] = api;
  return () => {
    if (root[MULTI_SCOPE_FIXTURE_GLOBAL] === api) delete root[MULTI_SCOPE_FIXTURE_GLOBAL];
  };
}
