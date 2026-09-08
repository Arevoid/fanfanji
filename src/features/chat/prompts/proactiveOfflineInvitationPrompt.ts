import type { AppointmentMode } from "../../../domain/schedule/scheduleTypes";

export const PROACTIVE_OFFLINE_DIRECTIVE_START = "[[OFFLINE_INVITATION]]";
export const PROACTIVE_OFFLINE_DIRECTIVE_END = "[[/OFFLINE_INVITATION]]";

const modeLabel = (mode: AppointmentMode) => mode === "immediate" ? "立即见面" : "未来约定";

/** Optional capability prompt. It never orders the character to invite. */
export function buildProactiveOfflineInvitationPrompt(input: {
  allowedModes: readonly AppointmentMode[];
  now: number;
  timeZone?: string;
}): string {
  const modes = input.allowedModes.map(modeLabel).join("、");
  const nowText = new Date(input.now).toISOString();
  return `[可选的线下邀请能力]
本轮只是允许你在确实符合完整人设、关系、当前对话和现实条件时，自然提出线下见面；不是要求你必须邀请。不要为了使用功能而改变角色的口癖、主动程度、情绪或聊天节奏。如果不适合，正常回复且不要输出任何内部标记。

本轮通过事实校验的邀请类型仅有：${modes || "无"}。当前时间：${nowText}${input.timeZone ? `（${input.timeZone}）` : ""}。
- “立即见面”仅表示当前地点条件已具备；仍必须先询问用户，不得声称用户已答应、你已经到用户家门口或线下剧情已经开始。
- “未来约定”可以包含合理出行安排；相对日期必须换算成带时区的绝对 ISO 8601 时间。时间尚未谈定时，startAt 设为 null、timePrecision 设为 undetermined。
- 用户是否接受、拒绝或改期只能由用户后续消息决定。

仅当你在可见聊天文字里确实提出了一次具体邀请时，才在全部聊天文字之后追加一次以下内部块；不得把内部字段写进聊天气泡：
${PROACTIVE_OFFLINE_DIRECTIVE_START}
{"mode":"scheduled","startAt":"2026-08-16T10:00:00+08:00","timePrecision":"exact","activity":"一起吃饭","location":"市中心","traveler":"character","transport":"坐车"}
${PROACTIVE_OFFLINE_DIRECTIVE_END}

字段限制：mode 只能使用本轮允许类型；timePrecision 只能是 exact、morning、afternoon、evening、date_only、undetermined；traveler 只能是 character、user、both、undetermined；未知字段使用 null，禁止虚构。`;
}
