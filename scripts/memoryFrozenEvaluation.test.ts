import assert from "node:assert/strict";
import { frozenMemoryCases,evaluationScope,evaluationNow,scoreFrozenPrompt } from "./fixtures/memoryFrozenEvaluation";
import { retrieveTruthForPrivatePrompt,formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
for(const test of frozenMemoryCases){const prompt=formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({scope:evaluationScope,now:evaluationNow,queryText:test.query,claims:test.claims,summaries:[],corrections:[],maxCharacters:test.maxCharacters}),{maxCharacters:test.maxCharacters});assert.equal(scoreFrozenPrompt(test,prompt).passed,true,test.id);}
console.log("PASS frozen evaluation v1: long-term final prompt, negative relevance, current revision, relation isolation, future plans and budget");
