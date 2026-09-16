import assert from "node:assert/strict";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";
import {
  CHARACTER_PHONE_GENERATION_COOLDOWN_MS,
  formatCharacterPhoneCooldownRemaining,
  getCharacterPhoneGenerationCooldowns,
  recordCharacterPhoneGenerationCooldowns,
} from "../src/features/characterPhone/characterPhoneGenerationCooldown";

const phone = {
  generationCooldowns: { browser: 10_800_000 },
} as Pick<CharacterPhoneRecord, "generationCooldowns">;

assert.deepEqual(getCharacterPhoneGenerationCooldowns(phone, ["browser"], 1), [
  { appId: "browser", until: 10_800_000 },
]);
assert.deepEqual(getCharacterPhoneGenerationCooldowns(phone, ["diary"], 1), [], "an unselected app does not inherit another app's cooldown");
assert.deepEqual(getCharacterPhoneGenerationCooldowns(phone, ["browser"], 10_800_000), [], "cooldown expires exactly at its deadline");
assert.equal(formatCharacterPhoneCooldownRemaining(3_600_000, 0), "1小时");

const initial = { generationCooldowns: { browser: 500 } } as CharacterPhoneRecord;
const updated = recordCharacterPhoneGenerationCooldowns(initial, ["diary"], 2_000);
assert.equal(updated.generationCooldowns?.diary, 2_000 + CHARACTER_PHONE_GENERATION_COOLDOWN_MS);
assert.equal(updated.generationCooldowns?.browser, 500, "recording one app leaves other app deadlines unchanged");
assert.equal(initial.generationCooldowns?.diary, undefined, "recording a cooldown is immutable");

console.log("PASS character-phone generation cooldowns are independent, persistent timestamps with a three-hour duration");
