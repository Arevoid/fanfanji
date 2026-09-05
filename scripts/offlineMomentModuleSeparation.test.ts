import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatOfflineWorldBookEntries } from "../src/features/offline/prompts/offlineWorldBookContext";
import type { WorldBookEntry } from "../src/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appChatSource = fs.readFileSync(path.join(root, "src/components/AppChat.tsx"), "utf8");
const appOfflineSource = fs.readFileSync(path.join(root, "src/components/AppOffline.tsx"), "utf8");
const generationSource = fs.readFileSync(path.join(root, "src/features/offline/hooks/useOfflineStoryGenerationActions.ts"), "utf8");
const momentStateSource = fs.readFileSync(
  path.join(root, "src/features/moments/hooks/useMomentComposerState.ts"),
  "utf8",
);

assert.match(appChatSource, /useMomentComposerState\(\)/);
assert.doesNotMatch(appChatSource, /const \[momentInputText, setMomentInputText\] = useState/);
assert.doesNotMatch(momentStateSource, /localStorage|sessionStorage|indexedDB/);
assert.match(generationSource, /collectOfflineWorldBookContext\(\{/);
assert.match(generationSource, /formatOfflineWorldBookEntries\(triggeredWorldBook\.values\(\)\)/);

const entry = (id: string, position: WorldBookEntry["position"]): WorldBookEntry => ({
  id,
  title: `标题${id}`,
  content: `内容${id}`,
  category: "测试",
  timestamp: 1,
  keywords: "",
  triggerType: "constant",
  isActive: true,
  position,
});

assert.equal(
  formatOfflineWorldBookEntries([entry("before", "before_char_def"), entry("depth", "at_depth")]),
  "【设定 - 标题before】\n内容before",
);

console.log("offline/moments module separation tests passed");
