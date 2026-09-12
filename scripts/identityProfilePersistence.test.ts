import assert from "node:assert/strict";
import { updateIdentityProfile } from "../src/domain/identity/identityProfile";
import { normalizeIdentitySettings } from "../src/core/storage/repositories/settingsRepository";
import type { UserSettings } from "../src/types";

const base = {
  name: "主号",
  avatar: "主号头像",
  signature: "旧签名",
  bio: "旧人设",
  apiKey: "",
  selectedModel: "",
  wallpaper: "",
  identities: [
    { id: "primary", name: "主号", avatar: "主号头像", signature: "旧签名", bio: "旧人设", kind: "primary" as const, rootIdentityId: "primary" },
    { id: "alias", name: "马甲", avatar: "马甲头像", signature: "", bio: "马甲人设", kind: "alias" as const, parentIdentityId: "primary", rootIdentityId: "primary" },
  ],
  activeIdentityId: "primary",
} as UserSettings;

const updated = updateIdentityProfile(base, "primary", { name: "新主号", avatar: "新头像", bio: "新人设" });
assert.equal(updated.identities?.find((identity) => identity.id === "primary")?.bio, "新人设");
assert.equal(updated.name, "新主号");
assert.equal(updated.avatar, "新头像");
assert.equal(updated.bio, "新人设");

const aliasUpdated = updateIdentityProfile(base, "alias", { name: "新马甲", bio: "新马甲人设" });
assert.equal(aliasUpdated.identities?.find((identity) => identity.id === "alias")?.bio, "新马甲人设");
assert.equal(aliasUpdated.name, "主号", "alias edits must not replace the primary profile projection");
assert.equal(aliasUpdated.bio, "旧人设");

const unknownKind = normalizeIdentitySettings({ ...base, identities: [{ ...base.identities![0], kind: "legacy-persona" } as any] }).settings;
assert.equal(unknownKind.identities?.[0]?.kind, "primary", "unknown legacy identity kinds remain visible as primary personas");

const recovered = normalizeIdentitySettings({ ...base, name: "旧用户", avatar: "旧头像", signature: "旧签名", bio: "旧背景", identities: [] }).settings;
assert.equal(recovered.identities?.length, 1);
assert.equal(recovered.identities?.[0]?.name, "旧用户");
assert.equal(recovered.identities?.[0]?.avatar, "旧头像");

console.log("PASS identity profile persistence and legacy visibility safeguards");
