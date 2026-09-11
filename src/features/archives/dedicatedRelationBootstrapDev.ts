import { createId } from "../../core/id/createId";
import { loadRelationships } from "../../core/storage/repositories/relationshipRepository";
import { getOfflineModeStorageKey, getConversationId, createRelationship, type CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { resolveDirectInteractionScope, type DirectInteractionScope } from "../chat/context/directInteractionScope";
import type { Character, Message, UserIdentity, UserSettings } from "../../types";
import { findSyntheticIdentity, fingerprintCanonicalId } from "./characterOwnershipBootstrapDev";
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
  bootstrap: () => Promise<DedicatedRelationInspectorResult>;
  inspectDedicatedEvidenceFixture: () => Promise<DedicatedRelationInspectorResult>;
}

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
): Character | undefined {
  if (characters.length !== 1) return undefined;
  const character = characters[0];
  return character.ownerIdentityId === identity.id && !character.isGroupChat && !character.isContactInstance
    ? character
    : undefined;
}

export function createDedicatedRelationBootstrapApi(
  dependencies: DedicatedRelationBootstrapDependencies,
): DedicatedRelationBootstrapApi {
  const inspectDedicatedEvidenceFixture = async (): Promise<DedicatedRelationInspectorResult> => {
    const settings = dependencies.getSettings();
    const identity = findSyntheticIdentity(settings.identities || []);
    const character = identity ? findOwnedCharacter(dependencies.readCharacters(), identity) : undefined;
    if (!identity || !character) return emptyResult("DEDICATED_FIXTURE_INSPECTOR_BLOCKED");

    const relationships = dependencies.readRelationships();
    const relation = relationships.length === 1
      && relationships[0].userIdentityId === identity.id
      && relationships[0].characterId === character.id
      ? relationships[0]
      : undefined;
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
    bootstrap: async () => {
      const identity = findSyntheticIdentity(dependencies.getSettings().identities || []);
      const characters = dependencies.readCharacters();
      const character = identity ? findOwnedCharacter(characters, identity) : undefined;
      const relationships = dependencies.getRelationships();
      if (!identity || !character || relationships.length > 1) {
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
      if (relationships.length === 1) {
        const existing = relationships[0];
        if (existing.userIdentityId !== identity.id || existing.characterId !== character.id) {
          return { ...emptyResult("DEDICATED_RELATION_BOOTSTRAP_BLOCKED"), identityFingerprint, characterFingerprint };
        }
        return inspectDedicatedEvidenceFixture();
      }

      const now = dependencies.now?.() ?? Date.now();
      const relation = createRelationship({
        id: createId("stage4d11o-relation"),
        characterId: character.id,
        userIdentityId: identity.id,
        now,
      });
      const saved = await dependencies.persistRelationships([relation]);
      if (!saved) {
        return { ...emptyResult("DEDICATED_RELATION_PERSISTENCE_BLOCKED"), identityFingerprint, characterFingerprint };
      }
      dependencies.captureRelationshipCreatedEvent(relation);
      const readback = dependencies.readRelationships();
      if (readback.length !== 1 || readback[0].id !== relation.id) {
        return { ...emptyResult("DEDICATED_RELATION_PERSISTENCE_BLOCKED"), identityFingerprint, characterFingerprint };
      }
      return inspectDedicatedEvidenceFixture();
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
