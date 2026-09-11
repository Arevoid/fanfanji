import { createId } from "../../core/id/createId";
import { readJson, writeJson } from "../../core/storage/storageAdapter";
import { storageKeys } from "../../core/storage/storageKeys";
import type { UserIdentity, UserSettings } from "../../types";
import {
  SYNTHETIC_IDENTITY_BIO,
  fingerprintCanonicalId,
  type CharacterOwnershipBootstrapResult,
} from "./characterOwnershipBootstrapDev";
import type {
  DedicatedRelationBootstrapOptions,
  DedicatedRelationInspectorResult,
} from "./dedicatedRelationBootstrapDev";

export const PORTABLE_DIRECT_CHAT_FIXTURE_GLOBAL = "__fanfanjiPortableDirectChatFixture" as const;
export const PORTABLE_DIRECT_CHAT_FIXTURE_ID = "stage4d3-portable" as const;
export const PORTABLE_DIRECT_CHAT_FIXTURE_LINEAGE = "Stage4D3Portable" as const;
export const PORTABLE_SYNTHETIC_IDENTITY_NAME = "Stage4D3Portable User" as const;

export interface PortableDirectChatFixtureManifest {
  schemaVersion: "fanfanji-portable-direct-chat-fixture-1";
  fixtureId: typeof PORTABLE_DIRECT_CHAT_FIXTURE_ID;
  lineage: typeof PORTABLE_DIRECT_CHAT_FIXTURE_LINEAGE;
  synthetic: true;
  portableFixture: true;
  historicalEvidenceImported: false;
  evidenceMode: "mechanism_characterization";
  defaultBehaviorRepresentative: false;
  summaryTriggerRound: 10;
  identityFingerprint: string;
  characterFingerprint: string;
  relationFingerprint: string;
  conversationFingerprint: string;
  createdAt: number;
  updatedAt: number;
}

export type PortableDirectChatFixtureStatus =
  | "PORTABLE_FIXTURE_READY_VALIDATED"
  | "PORTABLE_FIXTURE_PRECONDITION_BLOCKED"
  | "PORTABLE_FIXTURE_PERSISTENCE_BLOCKED"
  | "PORTABLE_FIXTURE_CHARACTER_BLOCKED"
  | "PORTABLE_FIXTURE_RELATION_BLOCKED";

export interface PortableDirectChatFixtureResult {
  status: PortableDirectChatFixtureStatus;
  fixtureId: typeof PORTABLE_DIRECT_CHAT_FIXTURE_ID;
  lineage: typeof PORTABLE_DIRECT_CHAT_FIXTURE_LINEAGE;
  synthetic: true;
  portableFixture: true;
  historicalEvidenceImported: false;
  evidenceMode: "mechanism_characterization";
  defaultBehaviorRepresentative: false;
  identityPresent: boolean;
  characterPresent: boolean;
  relationPresent: boolean;
  exactScopeHealth: boolean;
  summaryTriggerRound: number | null;
  eligibleMessageCount: number;
  triggerCount: number;
  distanceToTrigger: number;
  archiveMarkerPresent: boolean;
  identityFingerprint: string | null;
  characterFingerprint: string | null;
  relationFingerprint: string | null;
  conversationFingerprint: string | null;
  manifestPersisted: boolean;
}

interface PortableDirectChatFixtureDependencies {
  getSettings: () => UserSettings;
  saveSettings: (update: (previous: UserSettings) => UserSettings) => boolean;
  bootstrapCharacter: (options?: { fixtureId?: string; identityId?: string; characterName?: string }) => Promise<CharacterOwnershipBootstrapResult>;
  inspectCharacter: (options?: { fixtureId?: string; identityId?: string; characterName?: string }) => Promise<CharacterOwnershipBootstrapResult>;
  bootstrapRelation: (options?: DedicatedRelationBootstrapOptions) => Promise<DedicatedRelationInspectorResult>;
  inspectRelation: (options?: DedicatedRelationBootstrapOptions) => Promise<DedicatedRelationInspectorResult>;
  now?: () => number;
}

const emptyResult = (status: PortableDirectChatFixtureStatus): PortableDirectChatFixtureResult => ({
  status,
  fixtureId: PORTABLE_DIRECT_CHAT_FIXTURE_ID,
  lineage: PORTABLE_DIRECT_CHAT_FIXTURE_LINEAGE,
  synthetic: true,
  portableFixture: true,
  historicalEvidenceImported: false,
  evidenceMode: "mechanism_characterization",
  defaultBehaviorRepresentative: false,
  identityPresent: false,
  characterPresent: false,
  relationPresent: false,
  exactScopeHealth: false,
  summaryTriggerRound: null,
  eligibleMessageCount: 0,
  triggerCount: 20,
  distanceToTrigger: 20,
  archiveMarkerPresent: false,
  identityFingerprint: null,
  characterFingerprint: null,
  relationFingerprint: null,
  conversationFingerprint: null,
  manifestPersisted: false,
});

function portableIdentities(settings: UserSettings): UserIdentity[] {
  return (settings.identities || []).filter((identity) => identity.kind !== "alias"
    && !identity.archived
    && identity.syntheticFixtureId === PORTABLE_DIRECT_CHAT_FIXTURE_ID);
}

function createPortableIdentity(settings: UserSettings): UserIdentity {
  const id = createId("stage4d3-portable-identity");
  return {
    id,
    syntheticFixtureId: PORTABLE_DIRECT_CHAT_FIXTURE_ID,
    name: PORTABLE_SYNTHETIC_IDENTITY_NAME,
    avatar: "",
    signature: "Synthetic-only Direct Chat fixture",
    bio: SYNTHETIC_IDENTITY_BIO,
    kind: "primary",
    rootIdentityId: id,
    sortOrder: (settings.identities || []).length,
  };
}

function identityUpdate(settings: UserSettings, identity: UserIdentity): UserSettings {
  const identities = settings.identities || [];
  const existing = identities.some((candidate) => candidate.id === identity.id);
  const nextIdentities = existing
    ? identities.map((candidate) => candidate.id === identity.id ? identity : candidate)
    : [...identities, identity];
  return {
    ...settings,
    identities: nextIdentities,
    activeIdentityId: identity.id,
    name: identity.name,
    avatar: identity.avatar,
    signature: identity.signature,
    bio: identity.bio,
    identityDataVersion: Math.max(2, Number(settings.identityDataVersion) || 0),
  };
}

function buildManifest(result: PortableDirectChatFixtureResult, now: number): PortableDirectChatFixtureManifest | null {
  if (!result.identityFingerprint || !result.characterFingerprint || !result.relationFingerprint || !result.conversationFingerprint) return null;
  const previous = readJson<PortableDirectChatFixtureManifest | null>(storageKeys.devPortableFixtureManifest, null).value;
  return {
    schemaVersion: "fanfanji-portable-direct-chat-fixture-1",
    fixtureId: PORTABLE_DIRECT_CHAT_FIXTURE_ID,
    lineage: PORTABLE_DIRECT_CHAT_FIXTURE_LINEAGE,
    synthetic: true,
    portableFixture: true,
    historicalEvidenceImported: false,
    evidenceMode: "mechanism_characterization",
    defaultBehaviorRepresentative: false,
    summaryTriggerRound: 10,
    identityFingerprint: result.identityFingerprint,
    characterFingerprint: result.characterFingerprint,
    relationFingerprint: result.relationFingerprint,
    conversationFingerprint: result.conversationFingerprint,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
}

function resultFromInspection(
  identityFingerprint: string | null,
  character: CharacterOwnershipBootstrapResult,
  relation: DedicatedRelationInspectorResult,
): PortableDirectChatFixtureResult {
  const ready = relation.status === "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED"
    && relation.exactScopeHealth
    && character.status === "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED";
  return {
    status: ready ? "PORTABLE_FIXTURE_READY_VALIDATED" : relation.status.startsWith("DEDICATED_RELATION")
      || relation.status.startsWith("DEDICATED_EXACT")
      || relation.status.startsWith("DEDICATED_FIXTURE")
      ? "PORTABLE_FIXTURE_RELATION_BLOCKED"
      : "PORTABLE_FIXTURE_CHARACTER_BLOCKED",
    fixtureId: PORTABLE_DIRECT_CHAT_FIXTURE_ID,
    lineage: PORTABLE_DIRECT_CHAT_FIXTURE_LINEAGE,
    synthetic: true,
    portableFixture: true,
    historicalEvidenceImported: false,
    evidenceMode: "mechanism_characterization",
    defaultBehaviorRepresentative: false,
    identityPresent: Boolean(identityFingerprint),
    characterPresent: character.status === "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED",
    relationPresent: relation.status === "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED",
    exactScopeHealth: relation.exactScopeHealth,
    summaryTriggerRound: relation.triggerCount > 0 ? relation.triggerCount / 2 : null,
    eligibleMessageCount: relation.eligibleMessageCount,
    triggerCount: relation.triggerCount,
    distanceToTrigger: relation.distanceToTrigger,
    archiveMarkerPresent: relation.archiveMarkerPresent,
    identityFingerprint,
    characterFingerprint: relation.characterFingerprint,
    relationFingerprint: relation.relationFingerprint,
    conversationFingerprint: relation.conversationFingerprint,
    manifestPersisted: false,
  };
}

export function createPortableDirectChatFixtureApi(
  dependencies: PortableDirectChatFixtureDependencies,
): { bootstrap: () => Promise<PortableDirectChatFixtureResult>; inspect: () => Promise<PortableDirectChatFixtureResult> } {
  const inspect = async (): Promise<PortableDirectChatFixtureResult> => {
    const settings = dependencies.getSettings();
    const matches = portableIdentities(settings);
    if (matches.length !== 1) {
      return emptyResult("PORTABLE_FIXTURE_PRECONDITION_BLOCKED");
    }
    const identityFingerprint = await fingerprintCanonicalId(matches[0].id);
    const character = await dependencies.inspectCharacter({ fixtureId: PORTABLE_DIRECT_CHAT_FIXTURE_ID, identityId: matches[0].id, characterName: "Stage4D3Portable Character" });
    const relation = await dependencies.inspectRelation({ fixtureId: PORTABLE_DIRECT_CHAT_FIXTURE_ID, identityId: matches[0].id });
    return resultFromInspection(identityFingerprint, character, relation);
  };

  return {
    inspect,
    bootstrap: async () => {
      const settings = dependencies.getSettings();
      const matches = portableIdentities(settings);
      if (matches.length > 1) {
        return emptyResult("PORTABLE_FIXTURE_PRECONDITION_BLOCKED");
      }

      let identity = matches[0];
      if (!identity) {
        identity = createPortableIdentity(settings);
      }
      if (!dependencies.saveSettings((previous) => identityUpdate(previous, identity!))) {
        return emptyResult("PORTABLE_FIXTURE_PERSISTENCE_BLOCKED");
      }

      const character = await dependencies.bootstrapCharacter({ fixtureId: PORTABLE_DIRECT_CHAT_FIXTURE_ID, identityId: identity.id, characterName: "Stage4D3Portable Character" });
      if (character.status !== "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED") {
        const result = emptyResult("PORTABLE_FIXTURE_CHARACTER_BLOCKED");
        result.identityPresent = true;
        result.identityFingerprint = await fingerprintCanonicalId(identity.id);
        return result;
      }
      const relation = await dependencies.bootstrapRelation({ fixtureId: PORTABLE_DIRECT_CHAT_FIXTURE_ID, identityId: identity.id, characterId: undefined });
      const identityFingerprint = await fingerprintCanonicalId(identity.id);
      const result = resultFromInspection(identityFingerprint, character, relation);
      if (result.status !== "PORTABLE_FIXTURE_READY_VALIDATED") {
        result.status = "PORTABLE_FIXTURE_RELATION_BLOCKED";
        return result;
      }

      const manifest = buildManifest(result, dependencies.now?.() ?? Date.now());
      const persisted = manifest ? writeJson(storageKeys.devPortableFixtureManifest, manifest).success : false;
      result.manifestPersisted = persisted;
      if (!persisted) result.status = "PORTABLE_FIXTURE_PERSISTENCE_BLOCKED";
      return result;
    },
  };
}

export function installPortableDirectChatFixtureDevApi(
  dependencies: PortableDirectChatFixtureDependencies,
): () => void {
  let isDev = false;
  try {
    isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    isDev = false;
  }
  if (!isDev) return () => undefined;
  const root = globalThis as typeof globalThis & {
    [PORTABLE_DIRECT_CHAT_FIXTURE_GLOBAL]?: ReturnType<typeof createPortableDirectChatFixtureApi>;
  };
  const api = createPortableDirectChatFixtureApi(dependencies);
  root[PORTABLE_DIRECT_CHAT_FIXTURE_GLOBAL] = api;
  return () => {
    if (root[PORTABLE_DIRECT_CHAT_FIXTURE_GLOBAL] === api) delete root[PORTABLE_DIRECT_CHAT_FIXTURE_GLOBAL];
  };
}

export const readPortableDirectChatFixtureManifest = (): PortableDirectChatFixtureManifest | null => {
  const result = readJson<PortableDirectChatFixtureManifest | null>(storageKeys.devPortableFixtureManifest, null);
  return result.valid && result.value?.fixtureId === PORTABLE_DIRECT_CHAT_FIXTURE_ID ? result.value : null;
};
