import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MomentsApp } from "../src/features/moments/MomentsApp";
import { cleanAndExtractMoment, getMomentComments } from "../src/features/moments/services/momentContent";
import type { Character, Moment, UserSettings } from "../src/types";

const character: Character = { id: "char-a", name: "阿岚", avatar: "avatar.png", personality: "温柔", backstory: "测试" };
const settings: UserSettings = { name: "小林", avatar: "user.png", bio: "测试用户", apiKey: "", selectedModel: "" } as UserSettings;
const moment: Moment = { id: "moment-1", characterId: character.id, authorName: character.name, authorAvatar: character.avatar, content: "今天很开心", timestamp: 1, likes: [settings.name], comments: [] };
const markup = renderToStaticMarkup(<MomentsApp moments={[moment]} characters={[character]} settings={settings} translations={{}} filterCharacterId={null} onClearFilter={() => undefined} onClose={() => undefined} onAddMoment={() => undefined} onAddComment={() => undefined} onDeleteComment={() => undefined} onLikeMoment={() => undefined} onSaveSettings={() => undefined} onPublishUserMoment={() => undefined} onPublishComment={() => undefined} onUploadImage={async () => undefined} showToast={() => undefined} onMomentTextContextMenu={() => undefined} onMomentTextPointerDown={() => undefined} onMomentTextPointerUpOrLeave={() => undefined} onMomentTextPointerMove={() => undefined} onCommentClick={() => undefined} onCommentPointerDown={() => undefined} onClearCommentLongPress={() => undefined} />);

const parsed = cleanAndExtractMoment("正文\n评论：补充");
assert.equal(parsed.content, "正文");
assert.deepEqual(parsed.selfComments, ["补充"]);
assert.equal(getMomentComments({ ...moment, content: "正文\n评论：补充" }).length, 1);
assert.ok(markup.includes("今天很开心"));
assert.ok(markup.includes("w-10 h-10 rounded-[6px]"));
assert.ok(markup.includes("moments-comment-list") === false);
console.log("PASS moments content normalization, legacy comments, feed card, and preserved class names");
