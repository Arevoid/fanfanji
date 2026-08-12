import type { Message } from "../../../types";
import {
  expandCallRecordHistory,
  formatCallRecordHistory,
  isCallRecordMarkup,
  normalizePaymentMarkup,
  parseTextImageDescription,
  stripInternalDeliveryMarkers,
} from "../services/messageParser";
import { MEDIA_EVENT_PERSONA_RESPONSE_RULE } from "./chatPromptPolicy";
import { formatCurrentVoiceMessagePrompt, formatVoiceMessageHistory } from "./voiceMessagePrompt";

export type MessagePromptMode = "history" | "current";

export interface MessagePromptSerializerOptions {
  mode?: MessagePromptMode;
  userName?: string;
  characterName?: string;
  includeCallTranscript?: boolean;
  maxFileCharacters?: number;
}

export interface SerializedPromptTurn {
  role: "user" | "model";
  text: string;
  timestamp: number;
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const limitText = (value: string, limit: number): string => value.length > limit
  ? `${value.slice(0, limit)}\n[内容过长，后续 ${value.length - limit} 个字符未放入本次上下文]`
  : value;

const actorLabel = (message: Pick<Message, "sender">, options: MessagePromptSerializerOptions): string =>
  message.sender === "user"
    ? options.userName?.trim() || "用户"
    : options.characterName?.trim() || "角色";

const parseLegacyVoice = (content: string): { seconds?: string; transcript?: string } | undefined => {
  if (!content.startsWith("[语音")) return undefined;
  const quoted = content.match(/^\[语音[:：]?\s*["“]([^"”]+)["”]\s*\((\d+)(?:秒|s)\)\]/iu);
  if (quoted) return { transcript: quoted[1].trim(), seconds: quoted[2] };
  const seconds = content.match(/(\d+)\s*(?:秒|s)/iu)?.[1];
  const remainder = content.replace(/^\[语音[^\]]*\]\s*/u, "").trim();
  return { ...(seconds ? { seconds } : {}), ...(remainder ? { transcript: remainder } : {}) };
};

/**
 * Converts one stored chat Message into prompt-safe, role-neutral text.
 * Binary image data and attachment URLs are deliberately never returned.
 */
export function serializeMessageContentForPrompt(
  message: Message,
  options: MessagePromptSerializerOptions = {},
): string {
  const mode = options.mode || "history";
  const actor = actorLabel(message, options);
  const rawContent = normalizePaymentMarkup(message.content || "");
  const content = stripInternalDeliveryMarkers(rawContent);

  if (isCallRecordMarkup(content)) {
    return formatCallRecordHistory(content, {
      userName: options.userName,
      characterName: options.characterName,
      includeTranscript: options.includeCallTranscript !== false,
    }) || "[通话记录]";
  }

  const isBinaryImage = /^data:image\//iu.test(content);
  const isStoredImage = Boolean(message.imageAssetId) || /^\[图片\](?:$|\|)/u.test(content);
  if (isBinaryImage || isStoredImage) {
    if (mode === "current" && message.sender === "user") {
      return `[发送图片/照片] 我给你发送了一张照片。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
    }
    return `[图片消息：${actor}发送了一张图片；图片二进制内容未放入文本上下文]`;
  }

  const textImageDescription = parseTextImageDescription(content);
  if (textImageDescription !== null) {
    if (mode === "current" && message.sender === "user") {
      return `[发送文字图] 我发送了一张不含真实图片、仅用文字描述画面的文字图，描述内容是：“${textImageDescription}”。请把它当作我主动分享的画面描述来回应，不要声称看到了真实照片。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
    }
    return `[文字图：${textImageDescription || "未提供描述"}]`;
  }

  if (/^\[(?:红包|微信红包)\]/u.test(content)) {
    const [, amount = "8.88", greeting = "恭喜发财，万事如意"] = content.split("|");
    if (mode === "current" && message.sender === "user") {
      return `[发送红包] 我给你发送了一个金额为 ${amount} 元的微信红包，祝福语是：“${greeting}”。${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
    }
    return `[红包消息：${actor}发送了 ${amount} 元红包，祝福语：“${greeting}”]`;
  }

  if (/^\[(?:转账|微信转账)\]/u.test(content)) {
    const [, amount = "未知", memo = "转账", confirmed = "false"] = content.split("|");
    const status = confirmed === "true" ? "已收款" : "待确认";
    const description = `[转账消息：${actor}发起了 ${amount} 元转账，备注：“${memo}”，状态：${status}]`;
    return mode === "current" && message.sender === "user"
      ? `${description}${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`
      : description;
  }

  if (content.startsWith("[位置]")) {
    const location = content.split("|").slice(1).join("|").trim() || "未命名位置";
    const description = `[位置消息：${actor}分享了位置“${location}”；这只表示分享了地点，不证明发送者本人身处该地点]`;
    return mode === "current" && message.sender === "user"
      ? `${description}${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`
      : description;
  }

  if (content.startsWith("[音乐]")) {
    const [, title = "未知曲目", artist = ""] = content.split("|");
    const track = artist ? `《${title}》— ${artist}` : `《${title}》`;
    const description = `[音乐分享：${actor}分享了${track}；这是线上音乐分享，不代表双方处于同一地点]`;
    return mode === "current" && message.sender === "user"
      ? `${description}${MEDIA_EVENT_PERSONA_RESPONSE_RULE}\n禁止为了回应这次分享而补写地点、动作或双方共同场景，也不要新增未提供的现场状态。`
      : description;
  }

  if (content.startsWith("[文件]")) {
    const [, title = "无标题", encoded = ""] = content.split("|");
    const fileContent = limitText(safeDecode(encoded), options.maxFileCharacters ?? 6000);
    return `[文件分享：${actor}分享了《${title}》${fileContent ? `，内容如下：\n${fileContent}` : "，没有可确认的正文"}]${mode === "current" ? `\n${MEDIA_EVENT_PERSONA_RESPONSE_RULE}` : ""}`;
  }

  if (content.startsWith("[论坛分享]")) {
    const title = content.replace(/^\[论坛分享\]\s*/u, "").trim();
    return `[论坛帖子分享：${actor}分享了${title ? `《${title}》` : "一篇论坛帖子"}；帖子快照由本关系的论坛分享上下文提供]`;
  }

  if (message.diaryShareId || content.startsWith("[日记分享]")) {
    return `[日记分享：${actor}显式分享了一篇日记；冻结内容由本关系的日记分享上下文提供]`;
  }

  if (content.startsWith("[视频通话]")) {
    const status = content.split("|")[1] || "已结束";
    return `[视频通话记录：双方刚才进行了视频通话，状态：${status}]${mode === "current" ? MEDIA_EVENT_PERSONA_RESPONSE_RULE : ""}`;
  }

  if (content.startsWith("[语音通话]")) {
    const status = content.split("|")[1] || "已结束";
    return `[语音通话记录：双方刚才进行了语音通话，状态：${status}]${mode === "current" ? MEDIA_EVENT_PERSONA_RESPONSE_RULE : ""}`;
  }

  const voiceHistory = formatVoiceMessageHistory(content);
  if (voiceHistory) {
    if (mode === "current" && message.sender === "user") {
      return `${formatCurrentVoiceMessagePrompt(content)}\n${MEDIA_EVENT_PERSONA_RESPONSE_RULE}`;
    }
    return voiceHistory;
  }

  const legacyVoice = parseLegacyVoice(content);
  if (legacyVoice) {
    return legacyVoice.transcript
      ? `[语音消息${legacyVoice.seconds ? `，${legacyVoice.seconds}秒` : ""}；准确转写，与前后文字属于同一段对话]\n${legacyVoice.transcript}`
      : `[语音消息${legacyVoice.seconds ? `，${legacyVoice.seconds}秒` : ""}；未提供可确认的转写]`;
  }

  if (content.startsWith("[表情]|")) {
    const stickerName = content.split("|")[1]?.trim() || "未命名表情";
    const description = `[表情包：${actor}发送了“${stickerName}”；图片地址未放入文本上下文]`;
    if (mode !== "current" || message.sender !== "user") return description;
    return `${description}
【重要表情包处理规则】：
这个表情包只是用户正常聊天时随性表达的状态、心情、气场或情绪。不要为了点评表情包而中断前面正在进行的话题，也不要复述“你发了表情包”。优先自然延续已有对话；适合时可以顺应氛围回应。`;
  }

  return content || "[空消息]";
}

/** Expands a persisted call record into role-correct turns; all other messages stay one turn. */
export function serializeMessageToPromptTurns(
  message: Message,
  options: MessagePromptSerializerOptions = {},
): SerializedPromptTurn[] {
  const callTurns = expandCallRecordHistory(message.content, message.timestamp, {
    userName: options.userName,
    characterName: options.characterName,
  });
  if (callTurns) return callTurns.map((turn) => ({ ...turn, text: stripInternalDeliveryMarkers(turn.text) }));
  return [{
    role: message.sender === "user" ? "user" : "model",
    text: serializeMessageContentForPrompt(message, { ...options, mode: "history" }),
    timestamp: message.timestamp,
  }];
}

export function serializeMessagesAsTranscript(
  messages: readonly Message[],
  options: MessagePromptSerializerOptions = {},
  resolveSpeaker?: (message: Message) => string,
): string {
  return messages.flatMap((message) => serializeMessageToPromptTurns(message, options).map((turn) => {
    const speaker = resolveSpeaker?.(message)
      || (turn.role === "user" ? options.userName?.trim() || "用户" : options.characterName?.trim() || "角色");
    return `${speaker}: ${turn.text}`;
  })).join("\n");
}
