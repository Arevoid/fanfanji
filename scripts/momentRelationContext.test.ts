import assert from "node:assert/strict";
import { formatMomentSourceText } from "../src/features/moments/services/momentRelationContext";
import type { CharacterCognitiveContext } from "../src/domain/characterCognitive/characterCognitiveTypes";

const context = {
  persona: { personality: "温柔", backstory: "住在海边" },
  knownFacts: [{ content: "喜欢夜跑" }],
  recentEvents: [{ summary: "一起看过日落" }],
} as unknown as CharacterCognitiveContext;
assert.equal(formatMomentSourceText(context), "温柔\n住在海边\n喜欢夜跑\n一起看过日落");
assert.equal(formatMomentSourceText({
  persona: { personality: "", backstory: "" },
  knownFacts: [],
  recentEvents: [],
} as unknown as CharacterCognitiveContext), "");
console.log("Moment relation context: scoped source formatting passed");
