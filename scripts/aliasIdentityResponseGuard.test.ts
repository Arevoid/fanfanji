import assert from "node:assert/strict";
import {
  buildAliasIdentityCorrectionPrompt,
  detectAliasIdentityBoundaryViolation,
} from "../src/domain/prompt/aliasIdentityResponseGuard";

const strangerContext = {
  aliasName: "老莫",
  primaryName: "饭饭",
  hasPrimaryRelationship: true,
  recognitionState: "unknown" as const,
  currentUserMessage: "你是步随影？",
};

assert.equal(
  detectAliasIdentityBoundaryViolation("？宝宝你别吓我，我是步随影啊。", strangerContext),
  "unwarranted-familiarity",
);
assert.match(
  buildAliasIdentityCorrectionPrompt(strangerContext, "unwarranted-familiarity"),
  /老莫.*陌生联系人/,
);

assert.equal(
  detectAliasIdentityBoundaryViolation("饭饭？谁啊，完全不认识。", {
    ...strangerContext,
    currentUserMessage: "你认识饭饭吗？",
  }),
  "denied-known-primary",
);
assert.match(
  buildAliasIdentityCorrectionPrompt({ ...strangerContext, currentUserMessage: "你认识饭饭吗？" }, "denied-known-primary"),
  /必须承认自己认识“饭饭”/,
);

assert.equal(
  detectAliasIdentityBoundaryViolation("原来你就是饭饭！", strangerContext),
  "premature-identity-confirmation",
);
assert.equal(
  detectAliasIdentityBoundaryViolation("宝宝，我知道你就是饭饭。", {
    ...strangerContext,
    currentUserMessage: "我就是饭饭。",
  }),
  undefined,
);
assert.equal(
  detectAliasIdentityBoundaryViolation("宝宝，终于找到你了。", {
    ...strangerContext,
    recognitionState: "confirmed",
  }),
  undefined,
);

console.log("PASS alias identity response guard detection and correction prompts");

