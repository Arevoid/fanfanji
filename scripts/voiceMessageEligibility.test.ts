import assert from "node:assert/strict";
import { isBracketWrappedNarration } from "../src/features/chat/services/voiceMessageEligibility";

assert.equal(isBracketWrappedNarration("（微微一顿，随后把手机拿近了些）"), true);
assert.equal(isBracketWrappedNarration("(听到这句话，他皱了皱眉)"), true);
assert.equal(isBracketWrappedNarration("你今天怎么回来得这么晚？"), false);
assert.equal(isBracketWrappedNarration("（微微皱眉）\n你今天怎么回来得这么晚？"), false);
console.log("PASS bracketed narration remains text while spoken bubbles stay eligible for voice");
