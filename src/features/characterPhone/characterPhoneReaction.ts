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
  const direct = /(直接|坦率|外向|敏感|多疑|警觉|控制欲)/u.test(personality);
  const tone = /傲娇|嘴硬|调侃|毒舌|幽默/.test(personality)
    ? "别装作什么都没发生"
    : /温柔|体贴|敏感/.test(personality)
      ? "如果是你，希望你能告诉我"
      : /冷静|理性|克制/.test(personality)
        ? "我会先把这件事记下来"
        : "我总觉得哪里不太对劲";
  if (action.kind === "contact_removed") return `我刚发现联系人列表里少了一个人。${tone}，你最近动过我的手机吗？`;
  if (action.kind === "contact_remark_changed") return `我的联系人备注好像被改过了。${tone}，你知道是谁改的吗？`;
  if (action.kind === "chat_sent_as_character") {
    const target = action.detail?.replace(/^向/, "") || "别人";
    return direct
      ? `这条发给${target}的消息不是我发的。我记得自己没有碰手机，你刚刚用我的账号做了什么？`
      : `这条发给${target}的消息不是我发的。我不记得自己发过，${tone}，你刚刚动过我的手机吗？`;
  }
  if (action.app === "gallery") return direct
    ? `相册里有一处变化：${action.detail || "有一张照片被动过"}。这是你改的吗？`
    : `我整理相册时好像看到一处变化。${tone}，先告诉我一声，好吗？`;
  if (action.app === "diary") return direct
    ? `我的日记里出现了新的改动。${tone}，你看过或改过哪一篇？`
    : `我刚翻到日记，感觉有一页和记忆里不太一样。先记着，之后再问你。`;
  if (action.app === "notes") return direct
    ? `备忘录里多了一处改动。${tone}，这是你留下的吗？`
    : `备忘录好像被动过了，我先记下来，等想清楚再问。`;
  if (action.app === "browser") return direct
    ? `浏览器里多了一条我没印象的搜索记录。${tone}，你搜了什么？`
    : `我后来整理浏览记录时看到一条陌生搜索，暂时没想起来是谁搜的。`;
  if (action.app === "schedule") return `我的日程里多了一项不太像我会写的安排。${tone}，你知道是怎么回事吗？`;
  if (action.app === "moments") return direct
    ? `朋友圈里有一处变化，不像是我刚才的操作。${tone}，你动过那条动态吗？`
    : `我回看朋友圈时发现一处细节变化，先当作自己记错了。`;
  if (action.app === "music") return direct
    ? `最近收听记录里多了一首我没印象的歌。${tone}，你替我放过吗？`
    : `收听记录多了一首歌，可能是我什么时候顺手点到的。`;
  if (action.kind === "settings_changed") return `我的手机壁纸或图标好像换过了。${tone}，你有没有注意到？`;
  return `我发现手机里有一处变化。${tone}，你是不是来过？`;
}
