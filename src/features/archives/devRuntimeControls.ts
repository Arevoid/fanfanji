import { loadMessageWindow } from "../../core/storage/repositories/messageRepository";
import { messageMatchesMutationScope } from "../chat/context/directInteractionScope";
import { installCharacterOwnershipBootstrapDevApi, readCharacterRepositoryForOwnershipBootstrap, type CharacterOwnershipBootstrapOptions, type CharacterOwnershipBootstrapResult } from "./characterOwnershipBootstrapDev";
import { installDedicatedRelationBootstrapDevApi, readRelationshipRepositoryForDedicatedBootstrap, type DedicatedRelationBootstrapOptions, type DedicatedRelationInspectorResult } from "./dedicatedRelationBootstrapDev";
import { installMultiScopeFixtureDevApi } from "./multiScopeFixtureDev";
import { installPortableDirectChatFixtureDevApi } from "./portableDirectChatFixtureDev";
import type { Character, Message, UserSettings, UserSettingsUpdate } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";

export interface DevRuntimeControlsDependencies {
  getSettings: () => UserSettings;
  saveSettings: (update: UserSettingsUpdate) => boolean;
  getCharacters: () => readonly Character[];
  saveCharacter: (character: Character) => Promise<boolean>;
  getRelationships: () => readonly CharacterRelationship[];
  persistRelationships: (relationships: readonly CharacterRelationship[]) => Promise<boolean>;
  getMessages: () => readonly Message[];
  captureRelationshipCreatedEvent: (relationship: CharacterRelationship) => void;
  isCharactersRepositoryHydrated: () => boolean;
}

const CHARACTER_OWNERSHIP_GLOBAL = "__fanfanjiCharacterOwnershipBootstrap" as const;
const DEDICATED_RELATION_GLOBAL = "__fanfanjiDedicatedRelationBootstrap" as const;
const PORTABLE_FIXTURE_GLOBAL = "__fanfanjiPortableDirectChatFixture" as const;
const MULTI_SCOPE_GLOBAL = "__fanfanjiMultiScopeFixture" as const;
const LONG_EVIDENCE_GLOBAL = "__fanfanjiMemoryAdmissionLongEvidence" as const;

type CharacterOwnershipApi = {
  bootstrap: (options?: CharacterOwnershipBootstrapOptions) => Promise<CharacterOwnershipBootstrapResult>;
  inspect: (options?: CharacterOwnershipBootstrapOptions) => Promise<CharacterOwnershipBootstrapResult>;
};

type DedicatedRelationApi = {
  bootstrap: (options?: DedicatedRelationBootstrapOptions) => Promise<DedicatedRelationInspectorResult>;
  inspectDedicatedEvidenceFixture: (options?: DedicatedRelationBootstrapOptions) => Promise<DedicatedRelationInspectorResult>;
};

interface LongEvidenceApi {
  clear: () => void;
  enable: () => void;
  disable: () => void;
  clearWindow: () => void;
  createWindowToken: () => string;
  startWindow: (windowToken: string) => number | null;
  finishWindow: () => void;
  summary: () => unknown;
  exportJson: () => string;
}

const runtime = (): typeof globalThis & {
  [CHARACTER_OWNERSHIP_GLOBAL]?: CharacterOwnershipApi;
  [DEDICATED_RELATION_GLOBAL]?: DedicatedRelationApi;
  [PORTABLE_FIXTURE_GLOBAL]?: { bootstrap: () => Promise<unknown>; inspect: () => Promise<unknown> };
  [MULTI_SCOPE_GLOBAL]?: { bootstrap: (options: { fixtureId: string }) => Promise<unknown>; inspect: (options: { fixtureId: string }) => Promise<unknown> };
  [LONG_EVIDENCE_GLOBAL]?: LongEvidenceApi;
} => globalThis as typeof globalThis & {
  [CHARACTER_OWNERSHIP_GLOBAL]?: CharacterOwnershipApi;
  [DEDICATED_RELATION_GLOBAL]?: DedicatedRelationApi;
  [PORTABLE_FIXTURE_GLOBAL]?: { bootstrap: () => Promise<unknown>; inspect: () => Promise<unknown> };
  [MULTI_SCOPE_GLOBAL]?: { bootstrap: (options: { fixtureId: string }) => Promise<unknown>; inspect: (options: { fixtureId: string }) => Promise<unknown> };
  [LONG_EVIDENCE_GLOBAL]?: LongEvidenceApi;
};

const waitForHydration = async (isHydrated: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 100 && !isHydrated(); attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
};

/** Installs all synthetic/evidence APIs only from the DEV-only dynamic chunk. */
export function installDevRuntimeControls(dependencies: DevRuntimeControlsDependencies): () => void {
  const disposers = [
    installCharacterOwnershipBootstrapDevApi({
      getSettings: dependencies.getSettings,
      getCharacters: dependencies.getCharacters,
      saveCharacter: dependencies.saveCharacter,
      readCharacters: readCharacterRepositoryForOwnershipBootstrap,
    }),
    installDedicatedRelationBootstrapDevApi({
      getSettings: dependencies.getSettings,
      readCharacters: readCharacterRepositoryForOwnershipBootstrap,
      getRelationships: dependencies.getRelationships,
      persistRelationships: dependencies.persistRelationships,
      readRelationships: readRelationshipRepositoryForDedicatedBootstrap,
      readMessages: async (scope) => {
        try {
          return await loadMessageWindow({
            characterId: scope.characterId,
            relationId: scope.relationId,
            conversationId: scope.conversationId,
            limit: 10000,
          });
        } catch {
          return dependencies.getMessages().filter((message) => messageMatchesMutationScope(message, scope));
        }
      },
      captureRelationshipCreatedEvent: dependencies.captureRelationshipCreatedEvent,
    }),
    installPortableDirectChatFixtureDevApi({
      getSettings: dependencies.getSettings,
      saveSettings: dependencies.saveSettings,
      bootstrapCharacter: async (options) => {
        const api = runtime()[CHARACTER_OWNERSHIP_GLOBAL];
        if (!api) throw new Error("owned Character bootstrap API unavailable");
        return api.bootstrap(options);
      },
      inspectCharacter: async (options) => {
        const api = runtime()[CHARACTER_OWNERSHIP_GLOBAL];
        if (!api) throw new Error("owned Character bootstrap API unavailable");
        return api.inspect(options);
      },
      bootstrapRelation: async (options) => {
        const api = runtime()[DEDICATED_RELATION_GLOBAL];
        if (!api) throw new Error("dedicated relation bootstrap API unavailable");
        return api.bootstrap(options);
      },
      inspectRelation: async (options) => {
        const api = runtime()[DEDICATED_RELATION_GLOBAL];
        if (!api) throw new Error("dedicated relation bootstrap API unavailable");
        return api.inspectDedicatedEvidenceFixture(options);
      },
    }),
    installMultiScopeFixtureDevApi({
      getSettings: dependencies.getSettings,
      saveSettings: dependencies.saveSettings,
      bootstrapCharacter: async (options) => {
        const api = runtime()[CHARACTER_OWNERSHIP_GLOBAL];
        if (!api) throw new Error("owned Character bootstrap API unavailable");
        return api.bootstrap(options);
      },
      inspectCharacter: async (options) => {
        const api = runtime()[CHARACTER_OWNERSHIP_GLOBAL];
        if (!api) throw new Error("owned Character bootstrap API unavailable");
        return api.inspect(options);
      },
      bootstrapRelation: async (options) => {
        const api = runtime()[DEDICATED_RELATION_GLOBAL];
        if (!api) throw new Error("dedicated relation bootstrap API unavailable");
        return api.bootstrap(options);
      },
      inspectRelation: async (options) => {
        const api = runtime()[DEDICATED_RELATION_GLOBAL];
        if (!api) throw new Error("dedicated relation bootstrap API unavailable");
        return api.inspectDedicatedEvidenceFixture(options);
      },
    }),
  ];

  let cancelled = false;
  const bootstrapQuery = new URLSearchParams(window.location.search);
  const requestedCharacterAction = bootstrapQuery.get("characterOwnershipBootstrap") === "1"
    ? "bootstrap"
    : bootstrapQuery.get("characterOwnershipInspect") === "1" ? "inspect" : null;
  const requestedRelationAction = bootstrapQuery.get("dedicatedRelationBootstrap") === "1"
    ? "bootstrap"
    : bootstrapQuery.get("inspectDedicatedEvidenceFixture") === "1" ? "inspect" : null;
  const multiScopeFixture = bootstrapQuery.get("multiScopeFixture");
  const multiScopeAction = bootstrapQuery.get("multiScopeAction") === "inspect" ? "inspect" : "bootstrap";
  const portableAction = bootstrapQuery.get("portableDirectChatFixture") === "1"
    ? "bootstrap"
    : bootstrapQuery.get("inspectPortableDirectChatFixture") === "1" ? "inspect" : null;
  const evidenceAction = bootstrapQuery.get("memoryEvidence");

  const run = async (): Promise<void> => {
    if (requestedCharacterAction || requestedRelationAction || multiScopeFixture || portableAction) {
      await waitForHydration(dependencies.isCharactersRepositoryHydrated);
      if (cancelled) return;
    }
    if (requestedCharacterAction) {
      const api = runtime()[CHARACTER_OWNERSHIP_GLOBAL];
      if (api) {
        const result = requestedCharacterAction === "bootstrap" ? await api.bootstrap() : await api.inspect();
        if (!cancelled) console.info("[dev] owned Character bootstrap result", JSON.stringify(result));
      }
    }
    if (requestedRelationAction) {
      const api = runtime()[DEDICATED_RELATION_GLOBAL];
      if (api) {
        const result = requestedRelationAction === "bootstrap" ? await api.bootstrap() : await api.inspectDedicatedEvidenceFixture();
        if (!cancelled) console.info("[dev] dedicated relation fixture result", JSON.stringify(result));
      }
    }
    if (multiScopeFixture) {
      const api = runtime()[MULTI_SCOPE_GLOBAL];
      if (api) {
        const result = multiScopeAction === "inspect" ? await api.inspect({ fixtureId: multiScopeFixture }) : await api.bootstrap({ fixtureId: multiScopeFixture });
        if (!cancelled) console.info("[dev] multi-scope fixture result", JSON.stringify(result));
      }
    }
    if (portableAction) {
      const api = runtime()[PORTABLE_FIXTURE_GLOBAL];
      if (api) {
        const result = portableAction === "bootstrap" ? await api.bootstrap() : await api.inspect();
        if (!cancelled) console.info("[dev] portable Direct Chat fixture result", JSON.stringify(result));
      }
    }
    if (evidenceAction) {
      const module = await import("../chat/services/directChatMemoryLongEvidenceCollector");
      if (cancelled) return;
      const api = runtime()[LONG_EVIDENCE_GLOBAL];
      if (api) {
        if (evidenceAction === "start") {
          api.clearWindow();
          api.clear();
          api.enable();
          console.info("[dev] memory evidence window started", JSON.stringify({ started: api.startWindow(api.createWindowToken()) !== null }));
        } else if (evidenceAction === "finish") {
          api.finishWindow();
          api.disable();
          console.info("[dev] memory evidence window finished", JSON.stringify(api.summary()));
        } else if (evidenceAction === "summary") {
          console.info("[dev] memory evidence summary", JSON.stringify(api.summary()));
        } else if (evidenceAction === "export") {
          console.info("[dev] memory evidence export", api.exportJson());
        }
      }
      void module;
    }
    if (!cancelled && (requestedCharacterAction || requestedRelationAction || multiScopeFixture || portableAction || evidenceAction)) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  };
  void run();

  return () => {
    cancelled = true;
    disposers.reverse().forEach((dispose) => dispose());
  };
}
