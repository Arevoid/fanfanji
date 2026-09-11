import assert from "node:assert/strict";
import {
  createPortableDirectChatFixtureApi,
  PORTABLE_DIRECT_CHAT_FIXTURE_ID,
  PORTABLE_DIRECT_CHAT_FIXTURE_LINEAGE,
  PORTABLE_SYNTHETIC_IDENTITY_NAME,
  readPortableDirectChatFixtureManifest,
} from "../src/features/archives/portableDirectChatFixtureDev";
import { SYNTHETIC_IDENTITY_BIO } from "../src/features/archives/characterOwnershipBootstrapDev";
import type { UserSettings } from "../src/types";

const root = globalThis as typeof globalThis & { window?: unknown };
const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
} as unknown as Storage;
Object.defineProperty(root, "window", { value: { localStorage }, configurable: true });

let settings = {
  name: "Default",
  avatar: "",
  signature: "",
  bio: "",
  apiKey: "",
  selectedModel: "",
  wallpaper: "",
  customIcons: {},
  bubbleCss: "",
  globalCss: "",
  identities: [{ id: "identity-1", name: "Default", avatar: "", signature: "", bio: "", kind: "primary" }],
  activeIdentityId: "identity-1",
  identityDataVersion: 2,
} as unknown as UserSettings;

const characterReady = {
  status: "OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED",
  identityFingerprint: "identity-fp",
  characterFingerprint: "character-fp",
  characterCountBefore: 0,
  characterCountAfter: 1,
  ownerExact: true,
  summaryTriggerRound: 10,
  evidenceMode: "mechanism_characterization",
  defaultBehaviorRepresentative: false,
} as const;
const relationReady = {
  status: "DEDICATED_DIRECT_FIXTURE_READY_VALIDATED",
  fixtureId: "stage4d11o-dedicated-direct",
  lifecycleState: "ready",
  exactScopeHealth: true,
  eligibleMessageCount: 0,
  triggerCount: 20,
  distanceToTrigger: 20,
  archiveMarkerPresent: false,
  archiveMarkerFoundInLoadedScope: false,
  exactPendingRange: true,
  inFlight: false,
  cooldownActive: false,
  isGroup: false,
  isOffline: false,
  nextTurnTriggers: false,
  identityFingerprint: "identity-fp",
  characterFingerprint: "character-fp",
  relationFingerprint: "relation-fp",
  conversationFingerprint: "conversation-fp",
} as const;

const api = createPortableDirectChatFixtureApi({
  getSettings: () => settings,
  saveSettings: (update) => {
    settings = update(settings);
    return true;
  },
  bootstrapCharacter: async () => characterReady,
  inspectCharacter: async () => characterReady,
  bootstrapRelation: async () => relationReady,
  inspectRelation: async () => relationReady,
  now: () => 123456,
});

const result = await api.bootstrap();
assert.equal(result.status, "PORTABLE_FIXTURE_READY_VALIDATED");
assert.equal(result.fixtureId, PORTABLE_DIRECT_CHAT_FIXTURE_ID);
assert.equal(result.lineage, PORTABLE_DIRECT_CHAT_FIXTURE_LINEAGE);
assert.equal(result.synthetic, true);
assert.equal(result.portableFixture, true);
assert.equal(result.historicalEvidenceImported, false);
assert.equal(result.defaultBehaviorRepresentative, false);
assert.equal(result.exactScopeHealth, true);
assert.equal(result.summaryTriggerRound, 10);
assert.equal(result.distanceToTrigger, 20);
assert.equal(result.manifestPersisted, true);
assert.equal(settings.activeIdentityId !== "identity-1", true);
assert.equal(settings.identities?.some((identity) => identity.name === PORTABLE_SYNTHETIC_IDENTITY_NAME && identity.bio === SYNTHETIC_IDENTITY_BIO), true);

const manifest = readPortableDirectChatFixtureManifest();
assert.ok(manifest);
assert.deepEqual({
  fixtureId: manifest.fixtureId,
  lineage: manifest.lineage,
  synthetic: manifest.synthetic,
  portableFixture: manifest.portableFixture,
  historicalEvidenceImported: manifest.historicalEvidenceImported,
  evidenceMode: manifest.evidenceMode,
  defaultBehaviorRepresentative: manifest.defaultBehaviorRepresentative,
  summaryTriggerRound: manifest.summaryTriggerRound,
  createdAt: manifest.createdAt,
  updatedAt: manifest.updatedAt,
}, {
  fixtureId: "stage4d3-portable",
  lineage: "Stage4D3Portable",
  synthetic: true,
  portableFixture: true,
  historicalEvidenceImported: false,
  evidenceMode: "mechanism_characterization",
  defaultBehaviorRepresentative: false,
  summaryTriggerRound: 10,
  createdAt: 123456,
  updatedAt: 123456,
});

const conflictSettings = {
  ...settings,
  identities: [...(settings.identities || []), {
    id: "old-synthetic",
    name: "Old Stage4D3",
    avatar: "",
    signature: "",
    bio: SYNTHETIC_IDENTITY_BIO,
    kind: "primary" as const,
  }],
};
settings = conflictSettings;
const blocked = await api.inspect();
assert.equal(blocked.status, "PORTABLE_FIXTURE_PRECONDITION_BLOCKED");

delete root.window;
console.log("PASS portable Direct Chat fixture: synthetic lineage, exact metadata, manifest persistence, and conflict guard");
