import assert from "node:assert/strict";
import {
  CHARACTER_PHONE_PASSWORD_CHANGE_COOLDOWN_MS,
  evaluateCharacterPhonePasswordChange,
  parseCharacterPhonePasswordActionMarker,
  parseCharacterPhonePasswordChangeRequest,
} from "../src/domain/characterPhone/passwordPolicy";
import {
  changeCharacterPhonePasscode,
  createCharacterPhone,
  getCharacterPhone,
  saveCharacterPhone,
} from "../src/core/storage/repositories/characterPhoneRepository";
import type { Character } from "../src/types";

const values = new Map<string, string>();
const localStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) { values.set(key, value); },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });

assert.deepEqual(parseCharacterPhonePasswordChangeRequest("你改个密码吧，1234"), {
  purpose: "unlock",
  passcode: "1234",
});
assert.deepEqual(parseCharacterPhonePasswordChangeRequest("把隐藏相册密码换成 5678"), {
  purpose: "hidden-gallery",
  passcode: "5678",
});
assert.equal(parseCharacterPhonePasswordChangeRequest("我的生日是1234"), undefined);
assert.equal(parseCharacterPhonePasswordChangeRequest("手机密码是多少"), undefined);

const marker = parseCharacterPhonePasswordActionMarker(
  "好了。[[CHARACTER_PHONE_PASSWORD_CHANGE]]{\"decision\":\"accept\",\"purpose\":\"unlock\",\"passcode\":\"1234\",\"reason\":\"user_request\"}",
);
assert.equal(marker.visibleText, "好了。\n".trim());
assert.equal(marker.action?.passcode, "1234");
assert.equal(parseCharacterPhonePasswordActionMarker("[[CHARACTER_PHONE_PASSWORD_CHANGE]]not-json").visibleText, "not-json");

assert.equal(evaluateCharacterPhonePasswordChange({
  request: { purpose: "unlock", passcode: "1234" },
  action: { decision: "accept", purpose: "unlock", passcode: "1234" },
  relationship: "friend",
}).reason, "relationship_not_trusted");
assert.equal(evaluateCharacterPhonePasswordChange({
  request: { purpose: "unlock", passcode: "1234" },
  action: { decision: "accept", purpose: "unlock", passcode: "1234" },
  relationship: "partner",
}).allowed, true);
assert.equal(evaluateCharacterPhonePasswordChange({
  action: { decision: "accept", purpose: "unlock", passcode: "1234" },
}).reason, "missing_major_event");
assert.equal(evaluateCharacterPhonePasswordChange({
  action: { decision: "accept", purpose: "unlock", passcode: "1234", reason: "security_breach" },
  lastChangedAt: 1_000,
  now: 1_000 + CHARACTER_PHONE_PASSWORD_CHANGE_COOLDOWN_MS - 1,
}).reason, "cooldown");

const character: Character = {
  id: "password-policy-character",
  name: "密码测试角色",
  avatar: "avatar",
  personality: "谨慎",
  backstory: "测试用角色",
};
const phone = createCharacterPhone("password-policy-identity", character, 10);
const before = getCharacterPhone("password-policy-identity", character.id)!;
const unlockChange = changeCharacterPhonePasscode({
  ownerIdentityId: phone.ownerIdentityId,
  characterId: phone.characterId,
  purpose: "unlock",
  passcode: "1234",
  reason: "user_request",
  now: 20,
});
assert.equal(unlockChange.success, true);
assert.equal(unlockChange.changed, true);
assert.equal(unlockChange.phone?.passcode, "1234");
assert.equal(unlockChange.phone?.hiddenGalleryPasscode, before.hiddenGalleryPasscode);
assert.equal(unlockChange.phone?.posts.length, before.posts.length);
assert.equal(unlockChange.phone?.passwordChangedAt, 20);

const hiddenChange = changeCharacterPhonePasscode({
  ownerIdentityId: phone.ownerIdentityId,
  characterId: phone.characterId,
  purpose: "hidden-gallery",
  passcode: "5678",
  reason: "user_request",
  now: 30,
});
assert.equal(hiddenChange.success, true);
assert.equal(getCharacterPhone(phone.ownerIdentityId, phone.characterId)?.hiddenGalleryPasscode, "5678");
assert.equal(changeCharacterPhonePasscode({
  ownerIdentityId: phone.ownerIdentityId,
  characterId: phone.characterId,
  purpose: "unlock",
  passcode: "12",
}).error, "invalid_passcode");

// Keep the imported write path exercised so this test also catches accidental
// schema changes that make the updated record impossible to persist.
assert.equal(saveCharacterPhone(getCharacterPhone(phone.ownerIdentityId, phone.characterId)!).success, true);
