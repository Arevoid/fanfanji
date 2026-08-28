import type { Character } from "../../types";

export type CharacterPhoneAwarenessLevel = 1 | 2;

export function buildCharacterPhoneAwarenessMessage(character: Character, level: CharacterPhoneAwarenessLevel): string {
  const personality = `${character.personality || ""} ${character.backstory || ""}`;
  if (level === 1) {
    if (/傲娇|嘴硬|调侃|毒舌|幽默/.test(personality)) return "刚刚是不是有人试着打开我的手机？小老鼠，要不要自己出来？";
    if (/温柔|体贴|敏感/.test(personality)) return "刚刚是不是有人试着打开我的手机？如果是你，可以直接告诉我。";
    if (/冷静|理性|克制/.test(personality)) return "我的手机刚刚出现了一次异常解锁记录。你知道发生了什么吗？";
    return "刚刚是不是有人试着打开我的手机？怎么感觉有点不对劲。";
  }
  if (/傲娇|嘴硬|调侃|毒舌|幽默/.test(personality)) return "我的手机刚刚被锁了……你查得开心吗，小侦探？";
  if (/温柔|体贴|敏感/.test(personality)) return "我的手机刚刚被锁了。我知道有人来过了，你愿意和我说说吗？";
  if (/冷静|理性|克制/.test(personality)) return "连续错误解锁导致手机锁定。我会保留这次操作记录，请你解释一下。";
  return "我的手机刚刚被锁了……你是不是偷偷来过？";
}
