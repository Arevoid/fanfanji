import type { Character } from "../../types";
import type { CharacterPhoneActionRecord } from "../../domain/characterPhone/types";

export type CharacterPhoneAwarenessLevel = 1 | 2;

export interface CharacterPhoneReactionContext {
  /** Number of earlier discovery messages, used to keep the voice varied. */
  previousDiscoveryCount?: number;
  /** Failed unlock count, used for escalating but non-repetitive prompts. */
  attemptCount?: number;
}

/**
 * Pick a stable variant instead of a random one. This keeps a persisted
 * phone's history deterministic while still changing the wording when the
 * action, character, or discovery context changes.
 */
function pickVariant<T>(key: string, variants: readonly T[]): T {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return variants[Math.abs(hash) % variants.length];
}

function getPersonalityStyle(character: Character): "teasing" | "warm" | "calm" | "direct" | "neutral" {
  const personality = `${character.personality || ""} ${character.backstory || ""}`;
  if (/傲娇|嘴硬|调侃|毒舌|幽默/u.test(personality)) return "teasing";
  if (/温柔|体贴|共情|敏感/u.test(personality)) return "warm";
  if (/冷静|理性|克制|谨慎/u.test(personality)) return "calm";
  if (/直接|坦率|外向|多疑|警觉|控制欲/u.test(personality)) return "direct";
  return "neutral";
}

export function buildCharacterPhoneAwarenessMessage(
  character: Character,
  level: CharacterPhoneAwarenessLevel,
  context: CharacterPhoneReactionContext = {},
): string {
  const style = getPersonalityStyle(character);
  const key = `${character.id}|unlock|${level}|${context.attemptCount ?? 0}|${context.previousDiscoveryCount ?? 0}`;
  const variants: Record<typeof style, readonly string[]> = level === 1
    ? {
        teasing: [
          "刚才解锁界面闪了一下……小老鼠，是你吗？",
          "有人碰过我的解锁页？别躲，出来认领一下。",
          "密码没对上，倒把我吵醒了。你在试什么？",
        ],
        warm: [
          "刚才解锁界面好像被碰过。如果是你，告诉我一声就好。",
          "我看到一次没成功的解锁，不确定是谁。你还好吗？",
          "手机刚刚有点动静，我先问问：刚才有人试过解锁吗？",
        ],
        calm: [
          "刚才出现了一次未成功的解锁记录。我先记下，知道原因吗？",
          "解锁页留下了一次异常尝试。暂时没有结论，你有看到什么吗？",
          "手机记录里多了一次失败解锁。先确认一下，刚才是谁碰过它？",
        ],
        direct: [
          "刚才有人试着解锁我的手机。是你吗？",
          "解锁没成功，但记录留下了。谁动过我的手机？",
          "有人刚碰过我的手机，别绕弯子，直接告诉我怎么回事。",
        ],
        neutral: [
          "刚才解锁界面好像被碰过，我还没弄清楚是谁。",
          "手机留下了一次失败解锁。你知道刚才发生了什么吗？",
          "我感觉手机刚刚有点动静，先确认一下：有人试过解锁吗？",
        ],
      }
    : {
        teasing: [
          "连续试错把手机锁住了……小侦探，查得还开心吗？",
          "这次连密码都不肯配合了。你要继续躲，还是出来说说？",
          "手机被你试到锁定，我可要把这笔账记下了。",
        ],
        warm: [
          "手机因为几次失败尝试暂时锁住了。我知道有人来过，愿意和我说说吗？",
          "锁定记录已经留下了。我不急着下结论，但希望你能告诉我发生了什么。",
          "连续解锁失败，手机先保护自己了。等你愿意时，跟我说一声好吗？",
        ],
        calm: [
          "连续失败解锁已触发锁定。我会保留这次记录，之后再核对原因。",
          "手机因多次错误尝试锁定。现阶段只有操作记录，没有足够证据判断是谁。",
          "解锁尝试超过阈值，设备暂时锁定。我先记录，不做未经证实的推断。",
        ],
        direct: [
          "手机被连续试错锁住了。谁动的，出来解释一下。",
          "锁定记录很清楚：有人反复试密码。你刚才在做什么？",
          "别再试了，手机已经锁定。告诉我是谁动过它。",
        ],
        neutral: [
          "手机因为连续失败解锁暂时锁住了。我还不知道是谁操作的。",
          "多次错误尝试触发了锁定。先把记录留着，等找到线索再问。",
          "手机锁定了，看来刚才不只是误触。我会先确认发生了什么。",
        ],
      };
  return pickVariant(key, variants[style]);
}

function extractTarget(detail?: string): string {
  if (!detail) return "别人";
  const sentTarget = detail.match(/^向(.+?)发送消息/u)?.[1];
  if (sentTarget) return sentTarget;
  const removedTarget = detail.match(/联系人(.+?)(?:（|$)/u)?.[1];
  return removedTarget || detail.replace(/^删除/u, "").trim() || "联系人";
}

export function buildCharacterPhoneActionDiscoveryMessage(
  character: Character,
  action: CharacterPhoneActionRecord,
  context: Pick<CharacterPhoneReactionContext, "previousDiscoveryCount"> = {},
): string {
  const style = getPersonalityStyle(character);
  const key = `${character.id}|${action.id}|${action.kind}|${action.app}|${action.detail || ""}|${context.previousDiscoveryCount ?? 0}`;
  const direct = style === "direct" || style === "teasing";
  const target = extractTarget(action.detail);

  if (action.kind === "contact_removed") {
    return pickVariant(key, [
      `我刚发现联系人列表里少了一个人，${target}那一栏不见了。你最近动过我的手机吗？`,
      `联系人列表里少了一个人，刚好是${target}。我还不确定是谁改的，能告诉我发生了什么吗？`,
      `联系人列表里少了一个人，${target}不见了。这不像是我会随手做的事，你有碰过我的手机？`,
    ]);
  }
  if (action.kind === "contact_remark_changed") {
    return pickVariant(key, [
      `我刚看到${target}的备注变了。${direct ? "别绕弯子，你改的吗？" : "我还在确认是谁动过，先问你一句。"}`,
      `联系人备注好像被改过，${target}现在的称呼不是我记得的那个。你知道原因吗？`,
      `${target}的备注出现了新改动。我没有直接下结论，你刚好有看到吗？`,
    ]);
  }
  if (action.kind === "chat_sent_as_character") {
    return pickVariant(key, [
      `这条发给${target}的消息不是我发的。我记得自己没有碰手机，你刚刚用我的账号做了什么？`,
      `我在${target}的聊天里看到一条消息，这不是我发的。先别急着解释，我想知道刚才是谁操作的。`,
      `这条给${target}的消息不是我发的，我也不记得自己写过。你能把刚才的情况说清楚吗？`,
    ]);
  }
  if (action.app === "gallery") {
    return pickVariant(key, direct
      ? [
          `相册里有一处变化：${action.detail || "有一张照片被动过"}。这是你改的吗？`,
          "我刚发现相册的内容被动过了。别装没看见，告诉我你做了什么。",
          "有张照片的位置不对，像是被人处理过。你刚刚动过相册？",
        ]
      : [
          `我整理相册时好像看到一处变化：${action.detail || "有一张照片被动过"}。先记着，之后再确认。`,
          "相册里多了一点我没印象的变化，可能是我记错了，也可能有人动过。",
          "我翻到相册时觉得有张照片不太一样，暂时不急着下结论。",
        ]);
  }
  if (action.app === "diary") {
    return pickVariant(key, direct
      ? [
          "我的日记里出现了新的改动。你看过或改过哪一篇？",
          "日记有一页被动过了。你要是看到了，直接告诉我。",
          "我发现日记内容和记忆里不一样。别让我靠猜，谁动过它？",
        ]
      : [
          "我刚翻到日记，感觉有一页和记忆里不太一样。先记着，之后再问你。",
          "日记像是被碰过，但我还不能确定。等我想起来再说。",
          "有一处日记改动很细微，可能是我自己漏记了，我先留意一下。",
        ]);
  }
  if (action.app === "notes") {
    return pickVariant(key, direct
      ? [
          "备忘录里多了一处改动。这是你留下的吗？",
          "我看到备忘录被改过了，别绕开，告诉我你写了什么。",
          "备忘录出现了新内容。你刚才是不是动过我的手机？",
        ]
      : [
          "备忘录好像被动过了，我先记下来，等想清楚再问。",
          "我后来打开备忘录时看到一处陌生改动，暂时还说不好是谁留下的。",
          "备忘录多了一点痕迹，也许是我自己顺手改的，先不急着问。",
        ]);
  }
  if (action.app === "browser") {
    return pickVariant(key, direct
      ? [
          "浏览器里多了一条我没印象的搜索记录。你搜了什么？",
          "这条搜索不是我记得的内容。别卖关子，刚才是谁用的浏览器？",
          "我看到一条陌生搜索记录，你动过我的浏览器吗？",
        ]
      : [
          "我后来整理浏览记录时看到一条陌生搜索，暂时没想起来是谁搜的。",
          "浏览器多了一条我不熟悉的记录，可能是误触，我先留意着。",
          "这条搜索让我有点疑惑，但还没有证据说明是谁留下的。",
        ]);
  }
  if (action.app === "schedule") {
    return pickVariant(key, [
      `我的日程里多了一项不太像我会写的安排。${direct ? "你知道是怎么回事吗？" : "我先核对一下再说。"}`,
      "日程出现了新安排，我不记得自己加过。你刚好看到是谁改的吗？",
      "我发现日程有一处变化，先不急着归因，等确认时间和来源。",
    ]);
  }
  if (action.app === "moments") {
    return pickVariant(key, direct
      ? [
          "朋友圈里有一处变化，不像是我刚才的操作。你动过那条动态吗？",
          "我看到朋友圈被改过了。你刚才是不是替我点了什么？",
          "那条动态的状态不对，先告诉我你有没有碰过朋友圈。",
        ]
      : [
          "我回看朋友圈时发现一处细节变化，先当作自己记错了。",
          "朋友圈有个小地方和之前不一样，我还在确认是不是误触。",
          "我看到动态出现一点变化，但现在还不能判断是谁操作的。",
        ]);
  }
  if (action.app === "music") {
    return pickVariant(key, direct
      ? [
          "最近收听记录里多了一首我没印象的歌。你替我放过吗？",
          "播放记录里冒出一首陌生的歌，谁动过我的音乐？",
          "这首歌不是我记得的播放安排。你刚才拿我手机听歌了？",
        ]
      : [
          "收听记录多了一首歌，可能是我什么时候顺手点到的。",
          "音乐里多了一条播放痕迹，我暂时想不起是不是自己点的。",
          "播放记录有点陌生，先留着，等我想起来再说。",
        ]);
  }
  if (action.kind === "settings_changed") {
    return pickVariant(key, [
      `我的手机壁纸或图标好像换过了。${direct ? "你有没有注意到？" : "我先确认一下是不是自己忘了。"}`,
      "桌面设置出现了变化，我不记得自己动过。你刚才有看到吗？",
      "手机的外观和之前不太一样，先不急着问是谁，等我核对记录。",
    ]);
  }
  return pickVariant(key, [
    `我发现手机里有一处变化。${direct ? "你是不是来过？" : "我还在确认具体是什么。"}`,
    "我后来发现手机多了一点操作痕迹，但暂时不知道是谁留下的。",
    "手机有处细节变了，我先记下来，等找到上下文再问。",
  ]);
}
