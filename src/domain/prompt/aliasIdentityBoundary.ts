export interface AliasIdentityBoundaryInput {
  /** The primary user's public display name, if one is configured. */
  primaryName?: string;
  /** Whether this character has a relationship with the primary identity. */
  hasPrimaryRelationship: boolean;
  /** Persisted confidence that this alias is connected to the primary identity. */
  recognitionState?: "unknown" | "suspected" | "recognized" | "confirmed";
  aliasName?: string;
}

/**
 * Keeps an alias conversation separate from the primary relationship while
 * preserving facts the character would already know about the primary user.
 * This is prompt-only guidance: it never exposes identity records to the UI
 * and it does not merge the two relationship histories.
 */
export function buildAliasIdentityBoundaryPrompt(input: AliasIdentityBoundaryInput): string {
  const primaryName = input.primaryName?.trim().slice(0, 80) || "主号联系人";
  const knownPrimary = input.hasPrimaryRelationship
    ? `
- 你确实认识主号联系人“${primaryName}”，这是已知姓名事实。若当前用户询问“你认识${primaryName}吗”或提到这个名字，不得回答“谁啊”“不认识”；应按你与${primaryName}原有关系和人设自然回应。
- 认识“${primaryName}”不等于识别出当前别名联系人；除非对方明确说明，否则不要把两段关系、聊天记录、昵称或私密经历合并。`
    : `
- 当前没有足够事实证明你认识某个主号联系人；不要凭空编造主号姓名、关系或共同经历。`;
  const recognitionGuidance = input.recognitionState === "confirmed"
    ? `
- 这段关系中已经有明确内容把当前联系人与主号联系人联系起来。你可以在合适时承认“原来是同一个人”，但仍必须按当前关系读取聊天、记忆和隐私，不得把两段历史拼接成一段。`
    : input.recognitionState === "recognized"
      ? `
- 你已经有较强线索认为当前联系人可能与主号有关，但还没有最终确认。可以自然试探或保留疑问，不要把猜测说成事实。`
      : input.recognitionState === "suspected"
        ? `
- 你只注意到一些可疑线索。保持谨慎和不确定，不要直接断言当前联系人就是主号，也不要编造“我早就知道”。`
        : `
- 当前没有身份关联证据。不要凭名字、头像、措辞、设备提示或巧合把当前联系人认成主号。`;

  return `【马甲联系人身份边界与陌生人反应（高优先级）】
- 当前说话者是通过另一个用户身份新添加的联系人。你只能依据当前这段关系的聊天内容和明确公开事实，不得把对方自动当成你熟悉的主号联系人。
- 在对方明确自报身份或说明与主号的关系前，按陌生人或关系尚浅的方式自然回应：适度确认来意、保持必要距离、避免直接使用主号的亲昵称呼和私密细节。不要每轮机械盘问，也不要一上来就表现得像多年熟人；根据对方回答逐步调整熟悉度。
- 不要因为头像、措辞、话题或系统提示相似，就猜测当前联系人就是主号；也不要向对方透露“系统账户”“马甲”等内部概念。${knownPrimary}${recognitionGuidance}
- 如果对方明确说自己就是“${primaryName}”或明确解释两者关系，才可以在后续对话中自然更新判断；此前的陌生边界仍然适用。`;
}
