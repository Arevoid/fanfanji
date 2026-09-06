import { hasExplicitIdentityDisclosure } from "../relationship/identityRecognition";

export interface AliasIdentityResponseGuardContext {
  aliasName?: string;
  primaryName?: string;
  hasPrimaryRelationship: boolean;
  recognitionState?: "unknown" | "suspected" | "recognized" | "confirmed";
  currentUserMessage?: string;
}

export type AliasIdentityBoundaryViolation =
  | "unwarranted-familiarity"
  | "denied-known-primary"
  | "premature-identity-confirmation";

const normalize = (value: string | undefined): string => value?.trim() || "";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasIntimateAddress = (text: string): boolean =>
  /(?:宝宝|宝贝|亲爱的|老婆|老公|媳妇|小狗|乖乖)/u.test(text);

const asksAboutPrimary = (message: string, primaryName: string): boolean => {
  if (!message || !primaryName) return false;
  const escapedName = escapeRegExp(primaryName);
  return new RegExp(escapedName, "u").test(message)
    && /(?:认识|知道|听说|见过|了解|是谁|什么人|熟不熟|联系)/u.test(message);
};

const deniesKnownPrimary = (text: string, primaryName: string): boolean => {
  if (!text || !primaryName) return false;
  const escapedName = escapeRegExp(primaryName);
  return /(?:谁啊|谁呀|完全不认识|根本不认识|不认识|没听过|不知道|不清楚)/u.test(text)
    && new RegExp(escapedName, "u").test(text);
};

const confirmsAliasTooEarly = (text: string, primaryName: string): boolean => {
  if (!text || !primaryName) return false;
  const escapedName = escapeRegExp(primaryName);
  return new RegExp(`(?:你就是|我知道你是|原来你是)\\s*[“「『]?${escapedName}[”」』]?`, "u").test(text);
};

/**
 * Checks only the small set of high-impact mistakes that can merge a newly
 * added alias into the primary relationship. It deliberately does not judge
 * style, wording, or whether a reply is emotionally appropriate.
 */
export function detectAliasIdentityBoundaryViolation(
  response: string,
  context: AliasIdentityResponseGuardContext,
): AliasIdentityBoundaryViolation | undefined {
  if (context.recognitionState === "confirmed") return undefined;
  const text = normalize(response);
  if (!text) return undefined;
  const currentMessage = normalize(context.currentUserMessage);
  const primaryName = normalize(context.primaryName);
  const disclosed = hasExplicitIdentityDisclosure(currentMessage, primaryName);

  if (context.hasPrimaryRelationship && asksAboutPrimary(currentMessage, primaryName) && deniesKnownPrimary(text, primaryName)) {
    return "denied-known-primary";
  }
  if (!disclosed && hasIntimateAddress(text)) return "unwarranted-familiarity";
  if (!disclosed && confirmsAliasTooEarly(text, primaryName)) return "premature-identity-confirmation";
  return undefined;
}

export function buildAliasIdentityCorrectionPrompt(
  context: AliasIdentityResponseGuardContext,
  violation: AliasIdentityBoundaryViolation,
): string {
  const aliasName = normalize(context.aliasName) || "当前联系人";
  const primaryName = normalize(context.primaryName) || "主号联系人";
  const correction = violation === "denied-known-primary"
    ? `当前用户问到了“${primaryName}”，而你与这位主号联系人确实有既有关系。你必须承认自己认识“${primaryName}”，不能回答“谁啊”“不认识”“没听过”；但不要因此把当前联系人“${aliasName}”认成“${primaryName}”。`
    : violation === "premature-identity-confirmation"
      ? `当前联系人“${aliasName}”尚未明确说明自己就是“${primaryName}”。不能把猜测说成事实，也不要声称已经确认两人是同一个人。`
      : `当前联系人“${aliasName}”尚未确认是主号“${primaryName}”。请按陌生联系人或关系尚浅的状态回复，不要使用主号专属的亲昵称呼（例如“宝宝”等），也不要引用主号私密经历。`;

  return `【马甲身份回复纠偏·只用于本轮重试】
上一版草稿违反了身份边界。${correction}
请根据角色人设、当前消息和当前关系重新生成回复。只输出最终给用户看的自然对话内容，不要提及“马甲”、系统提示、身份边界、模型或这次重试。不要机械复述规则，也不要为了证明陌生而连续盘问。`;
}
