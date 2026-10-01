import { getCurrentAppointmentProposal } from "../../../domain/schedule/appointmentPolicy";
import type { Appointment } from "../../../domain/schedule/scheduleTypes";

export const PROACTIVE_OFFLINE_RESPONSE_START = "[[OFFLINE_RESPONSE]]";
export const PROACTIVE_OFFLINE_RESPONSE_END = "[[/OFFLINE_RESPONSE]]";

/**
 * Gives the model appointment context without forcing a particular reply.
 * The user's newest message remains the only authority for acceptance/rejection/counter-proposals.
 */
export function buildProactiveOfflineResponsePrompt(input: {
  appointment: Appointment;
  now: number;
  timeZone?: string;
}): string {
  const proposal = getCurrentAppointmentProposal(input.appointment);
  const proposalSnapshot = {
    appointmentId: input.appointment.id,
    mode: input.appointment.mode,
    status: input.appointment.status,
    startAt: proposal?.startAt ? new Date(proposal.startAt).toISOString() : null,
    timePrecision: proposal?.timePrecision || "undetermined",
    activity: proposal?.activity || null,
    location: proposal?.location || null,
    traveler: proposal?.traveler || "undetermined",
    transport: proposal?.transport || null,
  };

  return `[线下邀请回应能力]
当前存在一条等待回应、协商中或已确认但允许改期/改地点的线下约定：${JSON.stringify(proposalSnapshot)}。
当前时间：${new Date(input.now).toISOString()}${input.timeZone ? `（${input.timeZone}）` : ""}。

先按角色本人的人设、关系和语气自然回应用户最新消息。不要强迫赴约，也不要替用户作决定。
如果用户使用“测试邀约”“重新测试线下邀约”或类似测试词，只把它视为功能测试请求；不要在可见聊天里复述“测试坐标”“坐标覆写”“主控”“状态同步”“执行流程”等内部测试协议词，也不要把测试指令当成已经发生的真实位置事实。
只有用户最新消息明确表达下列含义时，才在全部可见聊天文字之后追加一次内部块：
- 明确接受当前提案：action=accept。
- 明确拒绝且没有提出替代安排：action=decline。
- 提出新的日期、时段、地点或活动安排：action=counter。相对日期必须根据当前时间换算为带时区的绝对 ISO 8601 时间；尚未确定具体时间时使用 startAt=null、timePrecision=undetermined。

如果当前约定已经确认，用户提出改期、改地点或改活动时，先按角色意愿明确同意或拒绝：明确同意才将 characterAccepts 设为 true；明确拒绝或仍在犹豫时设为 false。拒绝时系统不会改动原约定。

如果本轮没有成功生成内部块，不得在可见文字中声称“已更新参数”“邀约已发出”“已经确认”等状态变化，只能说明仍在等待确认或请用户重新确认。

counter 时，characterAccepts 只表示你在本轮可见回复中是否明确接受了用户的新提案。若你只是继续询问或无法确定，必须为 false。不得把含糊回答、转移话题或普通寒暄解释为同意。
内部块格式：
${PROACTIVE_OFFLINE_RESPONSE_START}
{"appointmentId":"原 appointmentId","action":"counter","startAt":"2026-08-16T10:00:00+08:00","timePrecision":"morning","activity":"一起吃饭","location":null,"traveler":"character","transport":null,"characterAccepts":true}
${PROACTIVE_OFFLINE_RESPONSE_END}

accept/decline 只需 appointmentId 与 action。不得输出多个内部块，不得在可见气泡中解释这些内部字段。`;
}
