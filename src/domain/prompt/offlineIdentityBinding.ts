export interface OfflineIdentityBindingInput {
  characterNames: readonly string[];
  userName?: string;
}

const uniqueNames = (names: readonly string[]): string[] => Array.from(new Set(
  names.map((name) => name.trim()).filter(Boolean),
));

export function buildOfflineIdentityBinding(input: OfflineIdentityBindingInput): string {
  const characterNames = uniqueNames(input.characterNames);
  const userName = input.userName?.trim() || "用户";
  const characterLabel = characterNames.length > 0 ? characterNames.join("、") : "当前角色";
  const hasNameCollision = characterNames.includes(userName);

  return `【线下剧情主体/客体身份绑定 — 最高优先】
- 你负责扮演的角色是：${characterLabel}。这些姓名只代表角色本人。
- 与角色互动的用户/故事主角是：${userName}。用户不是上述任何角色，也不能被写成上述角色本人。
1. 角色身份与用户身份永远不可互换。叙述中的“${characterNames[0] || "角色"}”指角色本人；叙述中的“用户”“你”${hasNameCollision ? "（本场显示名与角色重名时必须优先使用“你”）" : `或“${userName}”`}指用户。
2. 引号内必须先确定说话者。角色说“我”时，“我”只能指正在说话的角色；角色对用户说“你”时，“你”只能指用户。旁白视角设置只约束引号外叙述，绝不能改变引号内的说话者身份。
3. 当角色向用户告白、表达喜欢或谈论双方关系时，必须写成“我喜欢你”“我喜欢${hasNameCollision ? "你" : userName}”等主体清楚的表达。严禁把说话角色自己的姓名当作用户称呼或告白对象，例如严禁让角色 ${characterNames[0] || "角色"} 对用户说“${characterNames[0] || "角色"}，我喜欢你”或“${characterNames[0] || "角色"}，喜欢你”。
4. 若本场只有一个角色，所有未明确指向第三人的角色对白默认面向用户；该角色不能呼唤自己的姓名来称呼用户。
5. 多角色场景中，只有文本明确表明某角色正在对另一角色说话时，才能用另一角色的姓名作称呼；不得据此混淆用户身份。`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * In a single-character scene, a quote opening with that same character's
 * name as a vocative is an identity leak (the model treated itself as the
 * addressee). Remove only that narrow prefix and leave narration untouched.
 */
export function removeSingleActorSelfVocative(text: string, characterName: string): string {
  const name = characterName.trim();
  if (!name) return text;
  return text.replace(
    new RegExp(`([“「])\\s*${escapeRegExp(name)}\\s*[，,：:]\\s*`, "gu"),
    "$1",
  );
}
