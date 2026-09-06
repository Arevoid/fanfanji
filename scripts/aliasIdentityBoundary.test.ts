import assert from "node:assert/strict";
import { buildAliasIdentityBoundaryPrompt } from "../src/domain/prompt/aliasIdentityBoundary";

const known = buildAliasIdentityBoundaryPrompt({ primaryName: "饭饭", hasPrimaryRelationship: true });
assert.match(known, /陌生人或关系尚浅/);
assert.match(known, /确实认识主号联系人“饭饭”/);
assert.match(known, /不得回答“谁啊”“不认识”/);
assert.match(known, /不要把两段关系、聊天记录、昵称或私密经历合并/);
assert.match(known, /不要向对方透露“系统账户”“马甲”等内部概念/);

const unknown = buildAliasIdentityBoundaryPrompt({ hasPrimaryRelationship: false });
assert.match(unknown, /不要凭空编造主号姓名/);
assert.doesNotMatch(unknown, /确实认识主号联系人/);

console.log("PASS alias identity stranger boundary and primary-name knowledge prompt");
