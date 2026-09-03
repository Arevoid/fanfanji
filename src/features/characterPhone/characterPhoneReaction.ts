import type { Character } from "../../types";
import type { CharacterPhoneActionRecord } from "../../domain/characterPhone/types";

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

export function buildCharacterPhoneActionDiscoveryMessage(
  character: Character,
  action: CharacterPhoneActionRecord,
): string {
  const personality = `${character.personality || ""} ${character.backstory || ""}`;
  const tone = /傲娇|嘴硬|调侃|毒舌|幽默/.test(personality)
    ? "别装作什么都没发生"
    : /温柔|体贴|敏感/.test(personality)
      ? "如果是你，希望你能告诉我"
      : /冷静|理性|克制/.test(personality)
        ? "我会先把这件事记下来"
        : "我总觉得哪里不太对劲";
  if (action.kind === "contact_removed") return `我刚发现联系人列表里少了一个人。${tone}，你最近动过我的手机吗？`;
  if (action.kind === "contact_remark_changed") return `我的联系人备注好像被改过了。${tone}，你知道是谁改的吗？`;
  if (action.kind === "chat_sent_as_character") return `有人用我的口吻给${action.detail?.replace(/^向/, "") || "别人"}发了消息。${tone}，你今天怎么感觉怪怪的？`;
  if (action.kind === "settings_changed") return `我的手机壁纸或图标好像换过了。${tone}，你有没有注意到？`;
  if (action.kind === "schedule_changed") return `我的日程里多了一项不太像我会写的安排。${tone}，你知道是怎么回事吗？`;
  return `我发现手机里有一处变化。${tone}，你是不是来过？`;
}
