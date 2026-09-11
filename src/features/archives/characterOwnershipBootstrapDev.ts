import { createId } from "../../core/id/createId";
import { loadCharacters } from "../../core/storage/repositories/characterRepository";
import { createCharacterFromInput } from "../../domain/character/characterCreation";
import type { Character, UserIdentity, UserSettings } from "../../types";

export const CHARACTER_OWNERSHIP_BOOTSTRAP_GLOBAL = "__fanfanjiCharacterOwnershipBootstrap" as const;

const SYNTHETIC_IDENTITY_BIO = "仅用于本地开发证据验证的合成身份，不代表真实用户。";
const SYNTHETIC_CHARACTER_NAME = "Stage4D11OR4B Owned Character";
const DEFAULT_SYNTHETIC_AVATAR = "https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg";

export type CharacterOwnershipBootstrapStatus =
  | "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED"
  | "OWNED_CHARACTER_IDENTITY_CONTEXT_BLOCKED"
  | "OWNED_CHARACTER_RUNTIME_BOOTSTRAP_BLOCKED"
  | "OWNED_CHARACTER_RUNTIME_PERSISTENCE_BLOCKED";

export interface CharacterOwnershipBootstrapResult {
  status: CharacterOwnershipBootstrapStatus;
  identityFingerprint: string | null;
  characterFingerprint: string | null;
  characterCountBefore: number;
  characterCountAfter: number;
  ownerExact: boolean;
  summaryTriggerRound: number | null;
  evidenceMode: "mechanism_characterization";
  defaultBehaviorRepresentative: false;
}

export interface CharacterOwnershipBootstrapApi {
  bootstrap: () => Promise<CharacterOwnershipBootstrapResult>;
  inspect: () => Promise<CharacterOwnershipBootstrapResult>;
}

export function isCharacterOwnershipBootstrapDevRuntime(): boolean {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

interface CharacterOwnershipBootstrapDependencies {
  getSettings: () => UserSettings;
  getCharacters: () => readonly Character[];
  saveCharacter: (character: Character) => Promise<boolean>;
  readCharacters: () => readonly Character[];
}

const unavailableResult = (characterCountBefore: number, status: CharacterOwnershipBootstrapStatus): CharacterOwnershipBootstrapResult => ({
  status,
  identityFingerprint: null,
  characterFingerprint: null,
  characterCountBefore,
  characterCountAfter: characterCountBefore,
  ownerExact: false,
  summaryTriggerRound: null,
  evidenceMode: "mechanism_characterization",
  defaultBehaviorRepresentative: false,
});

/**
 * A privacy-safe, non-reversible display fingerprint for local evidence. The
 * canonical ID never leaves this function. Web Crypto is preferred; the
 * deterministic fallback keeps the dev seam usable on non-secure localhost
 * partitions without becoming an ID generator.
 */
async function fingerprintCanonicalId(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
  }

  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ byte, 0x85ebca6b) >>> 0;
  }
  return [first, second].map((part) => (part >>> 0).toString(16).padStart(8, "0")).join("");
}

function findSyntheticIdentity(identities: readonly UserIdentity[]): UserIdentity | undefined {
  const matches = identities.filter((identity) => identity.kind !== "alias"
    && !identity.archived
    && identity.bio.trim() === SYNTHETIC_IDENTITY_BIO);
  return matches.length === 1 ? matches[0] : undefined;
}

function buildSyntheticCharacter(ownerIdentityId: string): Character {
  return createCharacterFromInput({
    id: createId("stage4d11o-owned-character"),
    ownerIdentityId,
    name: SYNTHETIC_CHARACTER_NAME,
    age: "",
    gender: "synthetic",
    mbti: "ISTJ",
    avatar: DEFAULT_SYNTHETIC_AVATAR,
    personality: "A neutral synthetic character used only for local ownership validation.",
    backstory: "",
    summaryTriggerRound: 10,
    isGroupChat: false,
    isContactInstance: false,
    album: [],
    references: [],
    initialChatMode: "greeting",
    greeting: undefined,
    initialChatContext: undefined,
  });
}

export function createCharacterOwnershipBootstrapApi(
  dependencies: CharacterOwnershipBootstrapDependencies,
): CharacterOwnershipBootstrapApi {
  const inspect = async (): Promise<CharacterOwnershipBootstrapResult> => {
    const characters = dependencies.readCharacters();
    const identity = findSyntheticIdentity(dependencies.getSettings().identities || []);
    if (!identity || typeof identity.id !== "string" || !identity.id.trim()) {
      return unavailableResult(characters.length, "OWNED_CHARACTER_IDENTITY_CONTEXT_BLOCKED");
    }
    const identityFingerprint = await fingerprintCanonicalId(identity.id);
    const readback = characters.length === 1 ? characters[0] : undefined;
    const ownerExact = Boolean(readback && readback.ownerIdentityId === identity.id);
    return {
      status: readback && ownerExact
        ? "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED"
        : "OWNED_CHARACTER_RUNTIME_BOOTSTRAP_BLOCKED",
      identityFingerprint,
      characterFingerprint: readback ? await fingerprintCanonicalId(readback.id) : null,
      characterCountBefore: characters.length,
      characterCountAfter: characters.length,
      ownerExact,
      summaryTriggerRound: readback?.summaryTriggerRound ?? null,
      evidenceMode: "mechanism_characterization",
      defaultBehaviorRepresentative: false,
    };
  };

  return {
    bootstrap: async () => {
      const characterCountBefore = dependencies.getCharacters().length;
      if (characterCountBefore !== 0) {
        return unavailableResult(characterCountBefore, "OWNED_CHARACTER_RUNTIME_BOOTSTRAP_BLOCKED");
      }

      const identity = findSyntheticIdentity(dependencies.getSettings().identities || []);
      if (!identity || typeof identity.id !== "string" || !identity.id.trim()) {
        return unavailableResult(characterCountBefore, "OWNED_CHARACTER_IDENTITY_CONTEXT_BLOCKED");
      }

      const identityFingerprint = await fingerprintCanonicalId(identity.id);
      const character = buildSyntheticCharacter(identity.id);
      const saved = await dependencies.saveCharacter(character);
      if (!saved) {
        return {
          ...unavailableResult(characterCountBefore, "OWNED_CHARACTER_RUNTIME_PERSISTENCE_BLOCKED"),
          identityFingerprint,
        };
      }

      const readback = dependencies.readCharacters().find((candidate) => candidate.id === character.id);
      if (!readback) {
        return {
          ...unavailableResult(characterCountBefore, "OWNED_CHARACTER_RUNTIME_PERSISTENCE_BLOCKED"),
          identityFingerprint,
        };
      }

      const ownerExact = readback.ownerIdentityId === identity.id;
      const characterFingerprint = await fingerprintCanonicalId(readback.id);
      return {
        status: ownerExact ? "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED" : "OWNED_CHARACTER_RUNTIME_BOOTSTRAP_BLOCKED",
        identityFingerprint,
        characterFingerprint,
        characterCountBefore,
        characterCountAfter: dependencies.readCharacters().length,
        ownerExact,
        summaryTriggerRound: readback.summaryTriggerRound ?? null,
        evidenceMode: "mechanism_characterization",
        defaultBehaviorRepresentative: false,
      };
    },
    inspect,
  };
}

/** Installs the explicit dev-only global and leaves production builds untouched. */
export function installCharacterOwnershipBootstrapDevApi(
  dependencies: CharacterOwnershipBootstrapDependencies,
): () => void {
  if (!isCharacterOwnershipBootstrapDevRuntime()) return () => undefined;

  const root = globalThis as typeof globalThis & {
    [CHARACTER_OWNERSHIP_BOOTSTRAP_GLOBAL]?: CharacterOwnershipBootstrapApi;
  };
  const api = createCharacterOwnershipBootstrapApi(dependencies);
  root[CHARACTER_OWNERSHIP_BOOTSTRAP_GLOBAL] = api;
  return () => {
    if (root[CHARACTER_OWNERSHIP_BOOTSTRAP_GLOBAL] === api) {
      delete root[CHARACTER_OWNERSHIP_BOOTSTRAP_GLOBAL];
    }
  };
}

/** Repository adapter kept here so the orchestration cannot write storage directly. */
export const readCharacterRepositoryForOwnershipBootstrap = (): readonly Character[] => loadCharacters([]).value;
