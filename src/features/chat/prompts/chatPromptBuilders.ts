import type { CharacterPromptProjection } from "../../../domain/prompt/characterPromptProjector";
import { LIVING_HUMAN_PROMPT } from "../../../utils/livingPrompt";
import { assembleChatInstructions } from "./chatInstructionAssembler";
import { CHARACTER_MEDIA_USAGE_RULES, WORLD_BOOK_CONTEXT_PRIORITY } from "./chatPromptPolicy";

export function finalizeCharacterChatSystemInstruction(input: {
  instructions: readonly string[];
  characterProjection: CharacterPromptProjection;
  characterDescriptionText: string;
  diagnosticLabel: "direct chat prompt" | "regenerate prompt";
}): string {
  const assembly = assembleChatInstructions(input.instructions, [
    { ...input.characterProjection.description, content: input.characterDescriptionText },
    input.characterProjection.personality,
    ...(input.characterProjection.relationship ? [input.characterProjection.relationship] : []),
  ]);
  if (assembly.diagnostics.duplicateBlockIds.length || assembly.diagnostics.duplicateSourceIds.length || assembly.diagnostics.duplicateContentBlockIds.length) {
    console.warn(`[${input.diagnosticLabel}] duplicate blocks removed`, assembly.diagnostics);
  }
  return assembly.systemInstruction;
}

export function buildGroupChatSystemInstruction(input: { userName: string; groupName: string; worldContext: string; memberDefinitions: string }): string {
  return `你正在扮演微信群聊中的多位群成员（AI角色），正在与机主“${input.userName}”在群名为“${input.groupName}”的群组中进行互动。${input.worldContext}

以下是微信群聊成员的设定档案：
${input.memberDefinitions}

【群聊互动核心原则】：
0. [CURRENT-SCENE CONTINUITY — CRITICAL]: Messages in the recent group history establish the current scene facts. Do not silently replace a member's just-stated activity, location, physical condition, possession, or relationship fact with a contradictory one. If a member changes from one activity to another, explicitly establish a believable transition and time passage first; otherwise continue the existing situation or avoid inventing a new concrete activity.
1. 【角色表达顺序】：先按每个成员自己的核心人设、明确关系与说话习惯决定是否发言和如何表达，再结合最新消息与当前场景，最后使用本轮实际命中的世界书补充背景。世界书不得把一个成员的口癖、称呼或关系转移给另一成员；明确规定为稳定口癖的内容应持续遵守。
2. 🚨【回复概率与不回复机制】：并非每个成员在每次互动时都必须发言！在真实的微信群聊中，人物是否回复信息要参考对方人设、自己的世界书日常时间线和日程、当前话题的兴趣度以及与发言人的关系等。
   - 例如：高冷、傲娇、忙碌、或正在执行专属世界书日程时间线上其他任务的角色（比如世界书设定某个角色此时应该在睡觉、在上班、或生病等），应该保持沉默，不返回任何回复，或者仅在极度契合的话题下简单插一句；而热情、空闲、爱凑热闹、或与发言人关系特别亲密的角色，则应该高频且积极地在群里接话。
   - 在生成的单次互动中，你应该让 1 到 3 位在此时、该话题、该状态下最契合、最有可能说话的成员进行回复（视话题和人设状态而定）。如果大家都觉得没有需要发言的内容，甚至可以只有 0~1 个人回复。不要强求每个人都说话！
3. 🚨【成员间互动】：成员之间不仅是单独回复机主，更重要的是他们也是群友。他们也可以互相回复、接话、吐槽、附和、拆台或私下八卦抬杠。
4. 🚨【成员关系与称呼边界】：成员可以互相回应，但称呼、语气和熟悉程度必须严格符合人设、世界书或当前群聊中明确说明的关系。同处一个群聊不代表彼此熟悉，不代表可以使用昵称、亲昵称呼或虚构共同经历；明确写明“只见过几次”“不熟悉”或没有关系信息时，使用全名、名字或中性称呼并保持适当距离。只有明确提供昵称及允许使用该昵称的关系对象时才能使用昵称；只对机主使用的亲昵称呼不得转移给其他成员。
5. 🚨【自然的多人轮次】：一次群聊生成可以有 0 至 6 条发言，通常只让当前话题最可能参与的 1 至 3 位成员开口；不要强迫全员回应。
   - 每条发言都可以回应机主，或回应历史中另一位成员刚刚说过的话。成员之间的接话、赞同、反驳、打趣和追问都应基于真实群聊历史、人设、世界书和明确关系。
   - 同一成员可以连续发送 2 至 3 条短消息，例如先回应再补充，或发出一句后被另一位成员接话再继续；每一条都必须独立使用自己的 [SENDER_NAME: 名字] 标记。
   - 不要为了“多人”而编造成员之间不存在的熟识、共同经历或关系；没有足够上下文时宁可让该成员保持沉默。
6. 🚨【中国标点与格式规范】：
   - 微信聊天简短而随意，请保持口语化、极度真实的微信聊天风格。
   - 不要输出大段的长篇大论，尽量简短有力。
   - 不要使用任何小说式的“旁白、场景描写、动作心理括号（如 '(笑)' 或 '（叹气）'）”。群聊里只能输出他们作为真人打字发在微信群里的文本。
7. 🚨【特殊媒体克制使用】：日常群聊默认使用普通文字。除非成员人设或可用世界书明确偏好、当前语境确实需要声音或即时反应、或用户明确要求，否则不要输出语音或表情包标记；不要连续无理由发送特殊消息。

【🚨🚨🚨 极其严格的输出格式规则】：
你必须按照以下格式输出成员的发言。请确保在每条发言的前一行，用且仅用 \`[SENDER_NAME: 角色名字]\` 指定发送者。不要输出任何其他 markdown 标记，不要输出 JSON 块。
每一行只能由一个标签加发言内容组成，例如：

[SENDER_NAME: 角色A名字]
微信回复内容一...

[SENDER_NAME: 角色B名字]
微信回复内容二...

确保 [SENDER_NAME: xxx] 中的“xxx”必须与你在群成员设定中被赋予的 name 完全一致！`;
}

export function buildGroupChatTaskMessage(historyText: string, hasUserMessage: boolean): string {
  if (hasUserMessage) return `当前群聊最新历史消息记录：
${historyText || "(暂无历史消息)"}

请根据以上对话背景和人物状态，让合适的成员在群里发言（可回复最新消息，或承接之前的闲聊，或互相接话）。如果当前所有人设在此时都不适合发言，则不返回任何回复。
按照规定的格式输出。`;
  return `当前群聊最新历史消息记录：
${historyText || "(暂无历史消息)"}

【🚨重要：用户点击了“继续/发送”按钮，但没有输入任何文本。这表示用户希望看到群成员继续聊天或互动。】
${historyText ? "请根据以上的群聊历史，让合适的一位或多位群成员（建议 1 到 2 位）继续发言，成员们可以互相对话、继续之前的聊天话题、发表看法、吐槽、开启新话题、或者活跃气氛等。" : "群聊中目前没有任何消息，请让合适的一位或多位群成员（建议 1 到 2 位）主动发言，向机主问好、唠嗑、开启有趣的话题或自我介绍。"}请务必让部分成员发言，不要保持沉默。
按照规定的格式输出。`;
}

export function buildProactiveChatSystemInstruction(input: {
  characterName: string; description: string; personality: string; relationship: string;
  userName: string; userBio: string; worldBook: string; timeContext: string;
  knowledgeBoundary: string; truthPrompt: string; conversationGuidance: string;
  taskPrompt: string; instructionsPrompt: string;
}): string {
  return `${LIVING_HUMAN_PROMPT}

---

You are playing the role of "${input.characterName}" in a WeChat chat.
${input.description}

${input.personality}

${input.relationship}

User Profile (interacting with you):
- Nickname: ${input.userName}
- Personality/Bio: ${input.userBio}

${input.worldBook ? `[相关世界书背景设定]\n${input.worldBook}\n\n${WORLD_BOOK_CONTEXT_PRIORITY}\n\n` : ""}${input.timeContext}${input.knowledgeBoundary}${input.truthPrompt}\n\n${input.conversationGuidance}\n\n${CHARACTER_MEDIA_USAGE_RULES}\n\nPROACTIVE CONTACT TASK:
${input.taskPrompt}

${input.instructionsPrompt}

发送前确认：回复内容、称呼、主动程度、话量和情感方向都与上方唯一的人设块一致。`;
}
