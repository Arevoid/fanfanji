import { createId } from "../../core/id/createId";
import { loadRelationships } from "../../core/storage/repositories/relationshipRepository";
import { getOfflineModeStorageKey, getConversationId, createRelationship, type CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { resolveDirectInteractionScope, type DirectInteractionScope } from "../chat/context/directInteractionScope";
import type { Character, Message, UserIdentity, UserSettings } from "../../types";
import {
  findLegacyDedicatedSyntheticIdentity,
  findSyntheticIdentity,
  fingerprintCanonicalId,
  type CharacterOwnershipBootstrapOptions,
} from "./characterOwnershipBootstrapDev";
import { readString } from "../../core/storage/storageAdapter";

export const DEDICATED_RELATION_BOOTSTRAP_GLOBAL = "__fanfanjiDedicatedRelationBootstrap" as const;
const FIXTURE_ID = "stage4d11o-dedicated-direct";

export type DedicatedRelationBootstrapStatus =
  | "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED"
  | "DEDICATED_RELATION_FIXTURE_PRECONDITION_BLOCKED"
  | "DEDICATED_RELATION_CREATION_SIDE_EFFECT_BLOCKED"
  | "DEDICATED_RELATION_BOOTSTRAP_BLOCKED"
  | "DEDICATED_EXACT_SCOPE_BLOCKED"
  | "DEDICATED_FIXTURE_INSPECTOR_BLOCKED"
  | "DEDICATED_RELATION_PERSISTENCE_BLOCKED";

export interface DedicatedRelationInspectorResult {
  status: DedicatedRelationBootstrapStatus;
  fixtureId: string;
  lifecycleState: "character_bootstrapped" | "ready";
  exactScopeHealth: boolean;
  eligibleMessageCount: number;
  triggerCount: number;
  distanceToTrigger: number;
  archiveMarkerPresent: boolean;
  archiveMarkerFoundInLoadedScope: boolean;
  exactPendingRange: boolean;
  inFlight: boolean;
  cooldownActive: boolean;
  isGroup: boolean;
  isOffline: boolean;
  nextTurnTriggers: boolean;
  identityFingerprint: string | null;
  characterFingerprint: string | null;
  relationFingerprint: string | null;
  conversationFingerprint: string | null;
}

export interface DedicatedRelationBootstrapApi {
  bootstrap: (options?: DedicatedRelationBootstrapOptions) => Promise<DedicatedRelationInspectorResult>;
  inspectDedicatedEvidenceFixture: (options?: DedicatedRelationBootstrapOptions) => Promise<DedicatedRelationInspectorResult>;
}

export type DedicatedRelationBootstrapOptions = Pick<CharacterOwnershipBootstrapOptions, "fixtureId" | "identityId"> & {
  characterId?: string;
};

interface DedicatedRelationBootstrapDependencies {
  getSettings: () => UserSettings;
  readCharacters: () => readonly Character[];
  getRelationships: () => readonly CharacterRelationship[];
  persistRelationships: (relationships: readonly CharacterRelationship[]) => Promise<boolean>;
  readRelationships: () => readonly CharacterRelationship[];
  readMessages: (scope: DirectInteractionScope) => Promise<readonly Message[]>;
  captureRelationshipCreatedEvent: (relationship: CharacterRelationship) => void;
  now?: () => number;
  isInFlight?: () => boolean;
  isCooldownActive?: () => boolean;
}

const emptyResult = (status: DedicatedRelationBootstrapStatus): DedicatedRelationInspectorResult => ({
  status,
  fixtureId: FIXTURE_ID,
  lifecycleState: "character_bootstrapped",
  exactScopeHealth: false,
  eligibleMessageCount: 0,
  triggerCount: 20,
  distanceToTrigger: 20,
  archiveMarkerPresent: false,
  archiveMarkerFoundInLoadedScope: false,
  exactPendingRange: false,
  inFlight: false,
  cooldownActive: false,
  isGroup: false,
  isOffline: false,
  nextTurnTriggers: false,
  identityFingerprint: null,
  characterFingerprint: null,
  relationFingerprint: null,
  conversationFingerprint: null,
});

function triggerCountForCharacter(character: Character): number {
  const rounds = Number.isFinite(character.summaryTriggerRound)
    ? Math.min(100, Math.max(10, Math.round(character.summaryTriggerRound as number)))
    : 50;
  return rounds * 2;
}

function offlineForRelation(relationId: string): boolean {
  return readString(getOfflineModeStorageKey(relationId)).value === "true";
}

function findOwnedCharacter(
  characters: readonly Character[],
  identity: UserIdentity,
  options?: DedicatedRelationBootstrapOptions,
): Character | undefined {
  const owned = characters.filter((candidate) => candidate.ownerIdentityId === identity.id
    && !candidate.isGroupChat
    && !candidate.isContactInstance
    && (!options?.characterId || candidate.id === options.characterId)
    && (!options?.fixtureId || candidate.syntheticFixtureId === options.fixtureId));
  if (options?.fixtureId || options?.identityId || options?.characterId) return owned.length === 1 ? owned[0] : undefined;
  if (owned.length === 1) return owned[0];
  const legacy = owned.filter((candidate) => candidate.name === "Stage4D11OR4B Owned Character" && !candidate.syntheticFixtureId);
  return legacy.length === 1 ? legacy[0] : undefined;
}

function resolveIdentity(
  identities: readonly UserIdentity[],
  options?: DedicatedRelationBootstrapOptions,
): UserIdentity | undefined {
  if (options?.fixtureId || options?.identityId) return findSyntheticIdentity(identities, options);
  return findLegacyDedicatedSyntheticIdentity(identities) || findSyntheticIdentity(identities);
}

export function createDedicatedRelationBootstrapApi(
  dependencies: DedicatedRelationBootstrapDependencies,
): DedicatedRelationBootstrapApi {
  const inspectDedicatedEvidenceFixture = async (options?: DedicatedRelationBootstrapOptions): Promise<DedicatedRelationInspectorResult> => {
    const settings = dependencies.getSettings();
    const identity = resolveIdentity(settings.identities || [], options);
    const character = identity ? findOwnedCharacter(dependencies.readCharacters(), identity, options) : undefined;
    if (!identity || !character) return emptyResult("DEDICATED_FIXTURE_INSPECTOR_BLOCKED");

    const relationships = dependencies.readRelationships();
    const matchingRelationships = relationships.filter((candidate) => candidate.userIdentityId === identity.id
      && candidate.characterId === character.id
      && (!options?.fixtureId || candidate.syntheticFixtureId === options.fixtureId));
    const relation = matchingRelationships.length === 1 ? matchingRelationships[0] : undefined;
    const identityFingerprint = await fingerprintCanonicalId(identity.id);
    const characterFingerprint = await fingerprintCanonicalId(character.id);
    if (!relation) {
      return {
        ...emptyResult("DEDICATED_FIXTURE_INSPECTOR_BLOCKED"),
        identityFingerprint,
        characterFingerprint,
        triggerCount: triggerCountForCharacter(character),
        distanceToTrigger: triggerCountForCharacter(character),
      };
    }

    const scope = resolveDirectInteractionScope({
      characterId: character.id,
      activeIdentityId: identity.id,
      relationship: relation,
      characters: [character],
      isGroupChat: false,
    });
    if (!scope || scope.conversationId !== getConversationId(relation.id)) {
      return {
        ...emptyResult("DEDICATED_EXACT_SCOPE_BLOCKED"),
        identityFingerprint,
        characterFingerprint,
        relationFingerprint: await fingerprintCanonicalId(relation.id),
        conversationFingerprint: await fingerprintCanonicalId(getConversationId(relation.id)),
      };
    }

    const messages = await dependencies.readMessages(scope);
    const marker = relation.lastImmediateSummaryMsgId;
    const markerPresent = typeof marker === "string" && marker.length > 0;
    const markerFound = markerPresent && messages.some((message) => message.id === marker);
    const eligibleMessages = markerPresent
      ? (markerFound ? messages.slice(messages.findIndex((message) => message.id === marker) + 1) : [])
      : messages;
    const triggerCount = triggerCountForCharacter(character);
    const distanceToTrigger = Math.max(0, triggerCount - eligibleMessages.length);
    const inFlight = dependencies.isInFlight?.() ?? false;
    const cooldownActive = dependencies.isCooldownActive?.() ?? false;
    const isOffline = offlineForRelation(relation.id);
    return {
      status: "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED",
      fixtureId: FIXTURE_ID,
      lifecycleState: "ready",
      exactScopeHealth: true,
      eligibleMessageCount: eligibleMessages.length,
      triggerCount,
      distanceToTrigger,
      archiveMarkerPresent: markerPresent,
      archiveMarkerFoundInLoadedScope: markerFound,
      exactPendingRange: !markerPresent || markerFound,
      inFlight,
      cooldownActive,
      isGroup: false,
      isOffline,
      nextTurnTriggers: !isOffline && !inFlight && !cooldownActive && distanceToTrigger <= 2,
      identityFingerprint,
      characterFingerprint,
      relationFingerprint: await fingerprintCanonicalId(relation.id),
      conversationFingerprint: await fingerprintCanonicalId(scope.conversationId),
    };
  };

  return {
    inspectDedicatedEvidenceFixture,
    bootstrap: async (options?: DedicatedRelationBootstrapOptions) => {
      const identity = resolveIdentity(dependencies.getSettings().identities || [], options);
      const characters = dependencies.readCharacters();
      const character = identity ? findOwnedCharacter(characters, identity, options) : undefined;
      const relationships = dependencies.getRelationships();
      const scopedRelationships = identity && character
        ? relationships.filter((candidate) => candidate.userIdentityId === identity.id
          && candidate.characterId === character.id
          && (!options?.fixtureId || candidate.syntheticFixtureId === options.fixtureId))
        : [];
      if (!identity || !character || (!options?.fixtureId && relationships.length > 1)) {
        console.info("[dev] dedicated relation precondition", JSON.stringify({
          syntheticIdentityPresent: Boolean(identity),
          ownedCharacterPresent: Boolean(character),
          characterCount: characters.length,
          relationshipCount: relationships.length,
        }));
        return emptyResult("DEDICATED_RELATION_FIXTURE_PRECONDITION_BLOCKED");
      }
      const identityFingerprint = await fingerprintCanonicalId(identity.id);
      const characterFingerprint = await fingerprintCanonicalId(character.id);
      if (scopedRelationships.length === 1) {
        const existing = scopedRelationships[0];
        if (existing.userIdentityId !== identity.id || existing.characterId !== character.id) {
          return { ...emptyResult("DEDICATED_RELATION_BOOTSTRAP_BLOCKED"), identityFingerprint, characterFingerprint };
        }
        return inspectDedicatedEvidenceFixture(options);
      }

      const now = dependencies.now?.() ?? Date.now();
      const relation = createRelationship({
        id: createId("stage4d11o-relation"),
        syntheticFixtureId: options?.fixtureId,
        characterId: character.id,
        userIdentityId: identity.id,
        now,
      });
      const saved = await dependencies.persistRelationships(options?.fixtureId ? [...relationships, relation] : [relation]);
      if (!saved) {
        return { ...emptyResult("DEDICATED_RELATION_PERSISTENCE_BLOCKED"), identityFingerprint, characterFingerprint };
      }
      dependencies.captureRelationshipCreatedEvent(relation);
      const readback = dependencies.readRelationships();
      const readbackMatch = readback.find((candidate) => candidate.id === relation.id);
      if (!readbackMatch) {
        return { ...emptyResult("DEDICATED_RELATION_PERSISTENCE_BLOCKED"), identityFingerprint, characterFingerprint };
      }
      return inspectDedicatedEvidenceFixture(options);
    },
  };
}

export function installDedicatedRelationBootstrapDevApi(
  dependencies: DedicatedRelationBootstrapDependencies,
): () => void {
  let isDev = false;
  try {
    isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    isDev = false;
  }
  if (!isDev) return () => undefined;
  const root = globalThis as typeof globalThis & {
    [DEDICATED_RELATION_BOOTSTRAP_GLOBAL]?: DedicatedRelationBootstrapApi;
  };
  const api = createDedicatedRelationBootstrapApi(dependencies);
  root[DEDICATED_RELATION_BOOTSTRAP_GLOBAL] = api;
  return () => {
    if (root[DEDICATED_RELATION_BOOTSTRAP_GLOBAL] === api) delete root[DEDICATED_RELATION_BOOTSTRAP_GLOBAL];
  };
}

export const readRelationshipRepositoryForDedicatedBootstrap = (): readonly CharacterRelationship[] => loadRelationships([]).value;
