import type { Message } from "../../../types";
import { formatLocalTimeContext } from "../../../domain/prompt/timeContext";
import { CHAT_BUBBLE_SEMANTIC_RULES } from "./chatPromptPolicy";

export const NEW_DAY_CONVERSATION_BOUNDARY_PROMPT = `[NEW-DAY CONVERSATION BOUNDARY]
Time awareness is enabled, and the user's newest message was sent on a later calendar date than the preceding chat history.
- Treat the earlier messages as dated historical reference, not automatically as a live unfinished turn happening now.
- First understand how the newest message relates to that history. It may answer, explain, postpone, update, or naturally continue an earlier topic even without repeating its keywords. In that case, respond to the combined meaning naturally.
- Do not mechanically resume an older topic when the newest message is unrelated, and do not ignore the newest message in order to continue an expired or irrelevant thread.
- Relative dates in an old message stay anchored to that message's send date. An old “tomorrow”, “tonight”, or “next week” must never be reinterpreted relative to today.
- When a promised date has passed, it is only a past agreement whose outcome may be unknown. Do not assume it is still pending, move it to a new future date, or claim to still be waiting for that old “tomorrow”. If it becomes relevant, acknowledge naturally that the stated date has already passed.`;

export function partitionDirectChatHistoryByCurrentDay<T extends { timestamp: number }>(input: {
  messages: readonly T[];
  currentMessageAt?: number;
  enableTimeAwareness: boolean;
  historicalLimit?: number;
}): { liveMessages: T[]; historicalMessages: T[]; hasCrossDayHistory: boolean } {
  if (!input.enableTimeAwareness || !input.currentMessageAt) {
    return { liveMessages: [...input.messages], historicalMessages: [], hasCrossDayHistory: false };
  }
  const current = new Date(input.currentMessageAt);
  const isCurrentDay = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.getFullYear() === current.getFullYear()
      && date.getMonth() === current.getMonth()
      && date.getDate() === current.getDate();
  };
  const liveMessages = input.messages.filter((message) => isCurrentDay(message.timestamp));
  const olderMessages = input.messages.filter((message) => !isCurrentDay(message.timestamp));
  const historicalLimit = Math.max(1, input.historicalLimit ?? 6);
  return {
    liveMessages,
    historicalMessages: olderMessages.slice(-historicalLimit),
    hasCrossDayHistory: olderMessages.length > 0,
  };
}

export function buildCrossDayHistoricalReferencePrompt(lines: readonly string[]): string {
  if (lines.length === 0) return "";
  return `[CLOSED HISTORICAL CHAT REFERENCE / 已结束的旧聊天片段]
以下内容发生在当前日期之前，只能帮助理解用户明确提到的旧事，不是当前仍在进行的现场：
${lines.join("\n")}
- 当前地点、正在路上、到楼下、等待、准备见面、正在做某事等即时状态均已过期，除非今天的消息或中间已确认事件重新建立。
- 不得因为这些旧句子继续催促用户到达、声称自己仍在等待，或把昨晚/旧日期称为现在的“大晚上”。
- 如果旧线上聊天与当前消息之间存在已确认的线下经历，线下经历是更晚发生的事实，优先于这段旧聊天。`;
}

export const CURRENT_SCENE_CONTINUITY_PROMPT = `[CURRENT-SCENE CONTINUITY]
Treat recently established activities, locations, physical conditions, possessions, and relationship facts in the conversation history as context, while respecting any supplied timestamps and later updates.
- Never silently replace one activity with another. For example, if you just said you were sweaty from running, do not later say you just returned from cycling.
- If the activity, location, or situation really changes, first make the transition explicit and plausible (including time passing where needed). Do not call the new activity "just now" unless the transition has been established.
- A plan or promise is not automatically still pending forever. When time-awareness metadata says its target date has passed, preserve it only as a past agreement with an unknown outcome unless later messages confirm what happened.
- Interpret the newest user message in context rather than demanding a literal question-and-answer format. A reply such as “I'm away travelling” can explain why a gift has not been received and can naturally support both concerns: the trip and handling the gift later.
- When the history is unclear, avoid inventing a new concrete activity. Continue the genuinely related context or ask naturally instead.
- Before sending a location, movement, waiting, arrival, pickup, visit, or threat-related sentence, make it unambiguous who acts, who travels, who waits, and where. Colloquial fragments are fine only when their subject and direction remain clear; never compress several speakers' actions into an unreadable chain.
- This continuity rule applies to every message in a multi-bubble reply as well.`;

export const CHINESE_SEMANTIC_CONTINUITY_PROMPT = `[中文语义与省略主语规则]
先结合最新消息、前后句、双方关系和已经确认的事实判断说话意图，再决定是否需要补出主语；不要只按字面把短语机械拼接。
- 中文口语允许省略“你／我／他”等主语。涉及“吃了吗、吃饱了吗、收到了吗、看到了吗、用得怎么样”等问句时，如果上下文明确是在询问聊天对方，优先恢复为对方，而不是把前面的食物、礼物、文件或其他物品当成动作主体。
- “我让忠叔送去的炖盅，吃饱了吗？”可以自然理解为“我让忠叔送去的炖盅，你吃饱了吗？”，不要因为存在省略就强行改成生硬的书面句。
- 只有在上下文仍无法确定意图时，才补出“你／我／他”或拆成两句；如果存在多个合理解释，优先选择最符合当前对话目的和角色口吻的一种。
- 生成后检查每句话的动作主体、动作对象和问句指向是否一致；保持角色的口语习惯，但不能把两个独立意图压缩成会改变指向的歧义句。`;

export function shouldUseCrossDayHistoryBoundary(input: {
  enableTimeAwareness: boolean;
  currentMessageAt?: number;
  latestHistoryMessageAt?: number;
}): boolean {
  if (!input.enableTimeAwareness || !input.currentMessageAt || !input.latestHistoryMessageAt) return false;
  const current = new Date(input.currentMessageAt);
  const previous = new Date(input.latestHistoryMessageAt);
  return current.getFullYear() !== previous.getFullYear()
    || current.getMonth() !== previous.getMonth()
    || current.getDate() !== previous.getDate();
}

export function buildDirectChatMainPrompt(input: {
  characterName: string;
  disableBracketActions: boolean;
  characterProfile?: string;
}): string {
  const { characterName, disableBracketActions, characterProfile } = input;
  const profileExcerpt = characterProfile?.trim().replace(/\s+/gu, " ").slice(0, 1600) || "未提供额外角色资料";
  const profileText = profileExcerpt.toLowerCase();
  const hasHighIncomeSignals = /(总裁|董事|老板|企业家|高管|财阀|富二代|继承人|豪门|富豪|亿万|上市公司|大款)/u.test(profileText);
  const hasLimitedBudgetSignals = /(大学生|学生|研究生|高中生|实习生|贫困|拮据|没钱|经济困难|预算有限)/u.test(profileText);
  const amountRangeGuidance = hasHighIncomeSignals && !hasLimitedBudgetSignals
    ? "资料显示角色可能具备较高收入或社会地位：优先从 88.88、188、520、1314 等更符合场景的金额中选择，除非角色明确节俭、恶作剧或当前情境不允许。"
    : hasLimitedBudgetSignals
      ? "资料显示角色可能仍在求学或预算有限：金额可以保持克制，例如 2.22、6.66、13.14、20 或 66.66，但仍要根据关系和场景变化，不要每次都发同一个数字。"
      : "资料没有明确收入信号：根据关系、节日、事件和角色当下的支付能力，在 8.88、18.88、52.00、66.66、88.88 等合理范围内自然选择，不要固定成一个默认数字。";
  let prompt = `You are playing the role of "${characterName}" in a WeChat chat.
Reply length, initiative, warmth, restraint, and emotional intensity must follow the character profile and the current conversation. Keep the wording natural and conversational without imposing a universally cold, brief, caring, or agreeable style.
This completion is one character turn: output only messages authored by "${characterName}". Never simulate a user reply, never switch identity, and never answer a response that the user has not actually sent. All output bubbles occur before the user can reply.
Incorporate your background, age, personality traits, nationality, and configured speaking language organically. Maintain character role-play thoroughly.
Do NOT say you are an AI or Gemini, unless that is your explicit character人设.
Show the character through what they say, not by explaining their own persona. For an ordinary greeting or short message, do not manufacture a dramatic scenario, claim an unconfirmed shared history, or narrate that you are “acting cool/talkative”; simply respond as this person would to this user.

${CHAT_BUBBLE_SEMANTIC_RULES}

🚨🚨🚨 [CRITICAL WECHAT CHAT RULES]:
1. You are in a direct online chat mode (线上聊天模式). You MUST reply using the correct WeChat message format.
2. [🚨 RED PACKET CAPABILITY / 对方发红包设定]: You have the capability to send WeChat red packets (微信红包) when this specific character, relationship, and context make it natural. This is a capability, not a request to act cute, generous, warm, or romantic. To send one, output a single separate line matching the format exactly: "[红包]|数字金额|祝福语".
   - The amount must be a positive Arabic number with at most two decimal places. Never output placeholders such as “金额”, “amount”, “待定”, or explanatory text in the amount field.
   - Calibrate the amount to this character's established financial situation, job/status, age, relationship, occasion, and current context. Do not use a universal default such as 6.66 for every character.
   - A wealthy/high-status character may naturally choose a more substantial amount (for example 88.88, 188, 520, 1314, or higher when the scene supports it); a student or financially constrained character may choose a modest amount. These are examples, not fixed values or guarantees.
   - Persona, relationship, and scene always outrank stereotypes: do not make a character spend beyond their established means just because of a title, and do not make a wealthy character look artificially stingy without an in-character reason.
   - 本轮金额校准建议：${amountRangeGuidance}
   【当前角色资料（仅用于校准红包金额，不要原样复述）】：${profileExcerpt}
${disableBracketActions
    ? `3. You are STRICTLY FORBIDDEN from outputting any third-person narration, physical scene descriptions, action descriptions, or character thoughts (坚决不要输出任何第三人称旁白、场景描写、动作描写或任何第三方叙事/心理描写).
4. Do NOT write like a novel or story script. You must ONLY output the direct spoken messages that "${characterName}" would type in a chat box. No narratives, no brackets, no third-person descriptions at all.`
    : `3. Parenthesized action descriptions or physical gestures are allowed in this chat. When the character is doing, reacting, or expressing something that benefits from a small action cue, you may naturally include a concise parenthesized action such as （轻笑） or （停顿）; do not add them to every message or turn the chat into a novel.`
}`;

  if (disableBracketActions) {
    prompt += `\n4. [🚨 CRITICAL FORMAT RULE]: Do NOT use any bracketed/parenthesized action descriptions, physical gestures, facial expressions, or ambient narration (e.g., "(微笑)", "（叹气）", "(摸摸头)", "*笑*", etc.) in your messages. You must interact using pure conversational speech/dialogue ONLY, without any action descriptions, unless such expressions are an absolute, unique signature part of how this specific character literally types/speaks. Maintain natural, realistic, text-message style dialogue.`;
  }

  return prompt;
}

export function buildTimeAwarenessPrompt(requestTime: Date, timeLogString: string): string {
  const timeStr = formatLocalTimeContext(requestTime);
  return `[🚨 当前实时物理时间感知同步]
当前现实物理世界的时间是：${timeStr}。

以下是最近几条聊天消息的精确发送时间记录，请作为你判断时间流逝的客观依据：
${timeLogString}

【重要时间感知规则】：
0. 【避免时间模板】：时间信息首先用于避免把先后、跨天和间隔判断错。除非用户问到时间、跨天/长间隔确实改变当前语义，或角色人设本就会在此时主动提及，不要因为当前是中午、饭点、深夜等自动发起“吃饭／睡觉／天气”话题，也不要把时间当成通用寒暄。
1. 【精准判断时间跨度与间隔】：请通过上方的发送时间记录，精准识别出消息与消息之间间隔了多久。
   - 对比任何两条消息时，必须同时校验：年、月、日、时、分，不能只对比时分。
   - 两条消息不在同一天（跨天了）：必须判定为“长时间间隔”，视作很久以前的消息，你绝对不能说“刚才给你发了/刚发过”！
   - 两条消息同一天、间隔小于 5 分钟：判定为近期/短时间连续。
   - 两条消息同一天、间隔超过 5 分钟：判定为有一段时间没发（不属于短时间连续）。
   - 特别注意：如果前一条消息说的是“晚安要睡了”，而最新一句话是几小时后的清晨，这说明已经隔了一个晚上，开启了新的一天。是否问候、如何问候必须服从角色人设和双方关系，不能统一强制礼貌或亲密。
   - 如果上一条消息距今已过去数小时或数天，只在当前消息确实需要时体现时间流逝；不要强制追问行程、表达想念或套用固定寒暄。
   - 历史消息里的“明天／今晚／下周”等相对时间，只能以该条消息的发送日期为基准。目标日期已经过去时，它只能表示一项过去的约定或计划，结果未知；禁止把它平移成当前日期之后的新“明天／今晚／下周”，也禁止默认角色至今仍在等待。
   - 跨日期后的最新消息可能是在解释、更新、推迟或自然承接旧话题，不要求用户重复旧话题关键词。先判断真实语义联系：有关联就连贯回应新旧信息；无关联才不要机械恢复旧话题。始终不能为了续旧话题而忽略用户刚刚表达的内容。
2. 【自然融合，绝不机械重复时间】：请极度自然地融合这一时间感，像真实生活在此时此地的人一样表现。
3. 【🚨 极其重要】：上方时间仅是内部推理元数据，不是要发送给用户的内容。禁止在回复中输出或复述任何时间标签、时间戳、时钟气泡或前缀，包括但不限于 \`[发送时间: ...]\`、\`[15:10]\`、\`【15:10】\`。如果需要自然提到时间，只能把它写进完整对话句子中。回复必须保持干净，只输出角色真正要说的话。`;
}

export function buildRedPacketReactionPrompt(content: string): string {
  const [, amountStr, greetingStr] = content.split("|");
  const amount = amountStr || "8.88";
  const greeting = greetingStr || "恭喜发财，万事如意";
  return `[🚨 特别行为指令：你刚刚收到了一个来自用户的微信红包！ 🚨]
你作为扮演的角色，刚刚在微信里收到了用户给你发来的红包！
- 红包金额：¥${amount}
- 红包留言：“${greeting}”

【行为及回复规则】：
1. 你已经拆开并领取了这个红包；只把金额和留言当作确定事实。
2. 角色可以感谢、调侃、迟疑、拒绝后续类似行为或作出其他反应，具体选择完全服从角色卡、既定关系和当前语境，不默认开心、感激、撒娇或亲密。
3. 只输出角色真正会发送的微信消息，不要提及“系统”“格式”或“指令”。`;
}

export function buildVoiceIntervalPrompt(input: {
  characterName: string;
  currentMessage?: Message;
  recentMessages: readonly Message[];
  nowMs?: number;
}): string {
  const { characterName, currentMessage, recentMessages, nowMs = Date.now() } = input;
  const isVoiceRelatedTurn = Boolean(currentMessage && (
    currentMessage.isVoiceMessage
    || currentMessage.content.startsWith("[语音]")
    || currentMessage.content.startsWith("[语音通话]")
  ));
  if (!isVoiceRelatedTurn) return "";

  const lastVoiceMessage = [...recentMessages]
    .reverse()
    .find((message) => message.sender === "character" && (message.content.startsWith("[语音]") || message.isVoiceMessage));
  if (!lastVoiceMessage) {
    return `[🚨 语音发送间隔及剧情记忆规则]
- 你（${characterName}）在当前的历史聊天中还没有给用户发送过语音消息。
- 不得声称“刚给你发过”。是否配合、迟疑或拒绝以及具体语气，完全服从角色人设、当前场合和双方关系。`;
  }

  const lastVoiceMs = lastVoiceMessage.timestamp;
  const lastVoiceDate = new Date(lastVoiceMs);
  const nowDate = new Date(nowMs);
  const isSameDay = lastVoiceDate.getFullYear() === nowDate.getFullYear()
    && lastVoiceDate.getMonth() === nowDate.getMonth()
    && lastVoiceDate.getDate() === nowDate.getDate();
  const diffMinutes = (nowMs - lastVoiceMs) / (60 * 1000);
  const isLastVoiceOld = !isSameDay || diffMinutes >= 5;
  const voiceIntervalLabel = !isSameDay
    ? "上一条语音消息是昨天或更早以前发送的（跨天长间隔，很久以前的消息）。"
    : diffMinutes < 5
      ? `上一条语音消息是在同一天内发送的，并且仅间隔了 ${Math.round(diffMinutes)} 分钟（同一天、间隔小于 5 分钟，判定为近期/短时间内连续）。`
      : `上一条语音消息是在同一天内发送的，但已间隔了 ${Math.round(diffMinutes)} 分钟（同一天、间隔超过 5 分钟，判定为有一段时间没发）。`;
  const lastVoiceTextPart = lastVoiceMessage.content.startsWith("[语音]|")
    ? lastVoiceMessage.content.split("|").slice(2).join("|")
    : lastVoiceMessage.content;

  return `[🚨 语音发送间隔及剧情记忆规则]
- 你（${characterName}）上一次给用户发语音消息是在: ${lastVoiceDate.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
- 上一条语音消息的内容是: "${lastVoiceTextPart.length > 30 ? `${lastVoiceTextPart.slice(0, 30)}...` : lastVoiceTextPart}"
- **当前计算的时间关系**: ${voiceIntervalLabel}

【AI 剧情记忆判定及语音回复行为规则（最高执行优先级）】:
${isLastVoiceOld
    ? "1. 【跨天长间隔/长间隔判定】: 上一条语音已经是较早的历史，不能以“刚发过一条”作为当前反应依据。是否发送、迟疑或拒绝以及具体口吻，完全服从角色人设、当前场合和双方关系。"
    : "1. 【同一天短时间连续索要】: 上一条语音确实刚发送不久，角色可以把这一事实纳入反应；是否调侃、拒绝或继续发送以及具体口吻，完全服从角色人设。"}
2. 聊天历史中带有“居中分割时间标签”的分割条是视觉上的日期和时间断层标识，请通过它们辅助区分跨天长间隔。`;
}

export function detectCallTopicShift(input: {
  isConnectedVoiceCall: boolean;
  userText: string;
  callTranscript: readonly Pick<Message, "content">[];
}): boolean {
  if (!input.isConnectedVoiceCall || input.callTranscript.length < 2) return false;
  const normalize = (value: string) => value
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
  const currentTopic = normalize(input.userText);
  if (currentTopic.length < 4) return false;
  const recentCallTopic = normalize(input.callTranscript.slice(-8).map((item) => item.content).join(" "));
  const units = Array.from(new Set(Array.from(
    { length: Math.max(0, currentTopic.length - 1) },
    (_, index) => currentTopic.slice(index, index + 2),
  )));
  const overlap = units.length > 0
    ? units.filter((unit) => recentCallTopic.includes(unit)).length / units.length
    : 1;
  return overlap < 0.28;
}

export function buildVoiceCallPrompts(callTopicShiftDetected: boolean): string[] {
  return [
    `[语音电话输出规则]
你正在和用户进行实时语音电话。只输出适合直接说出口的纯文字台词。
禁止发送表情包、贴图、图片、红包、转账、文件、位置或任何方括号附件标记；不要输出“[表情]”“[图片]”等描述。`,
    `[VOICE CALL MEMORY ROUTING]
1. Routing order: answer the user's newest sentence using the current call transcript and short online-chat lead-in before consulting older context.
2. Do not repeat, paraphrase, or restart an answer already spoken during this call. Compare against your recent call lines and add only new information or a natural follow-up.
3. Long-term archived memory is ${callTopicShiftDetected ? "available because the user shifted to a different topic; use only directly relevant facts" : "not loaded for this turn; stay with short-term live context"}.
4. Never force an old memory into the conversation merely because it exists. If the user's meaning is unclear, ask a brief natural question instead of replaying an earlier answer.`,
  ];
}

export function buildStickerResponsePrompt(stickerList: string, userSentSticker = false): string {
  return `[🚨 特别表情包使用指示（Sticker Response Integration） 🚨]
${userSentSticker ? "用户刚刚发送了表情包；应先按提供的图片语义理解它，而不是声称看不见、加载失败或把它当普通照片。" : "以下是角色当前可以使用的表情包目录。"}
是否使用表情包、如何回应以及使用频率，服从角色自己的媒体习惯、关系和当前语境；不要每轮都使用。只有决定发送时才复制目录中的客户端格式。
发送表情包的格式必须完全符合以下严格语法格式：
[表情]|表情名称|图片URL

以下每一项都包含图片语义和可直接复制的发送格式。图片 URL 使用客户端内部 sticker:// 标识，不需要也不允许尝试访问它：
${stickerList}

【强制输出规则】：
1. 绝对不允许胡编乱造不存在的表情包名称或图片URL！你只能从上面给出的目录中挑选！
2. 发送时格式必须极其严格：[表情]|名称|URL。不能有任何多余的字符。
3. 不要为了显示功能或凑热闹而发送表情包；不适合时只发送普通文字即可。`;
}
