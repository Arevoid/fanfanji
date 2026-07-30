export const buildDiaryPrompt = (input: { characterName: string; occurredAt: number; characterProfile: string; relationshipState: string; context: string }): string => {
  const occurredAt = new Date(input.occurredAt).toLocaleString("zh-CN", { hour12: false });
  return `你正在以${input.characterName}的第一人称写一篇私密日记。事件时间是 ${occurredAt}。\n角色资料：${input.characterProfile}\n关系状态：${input.relationshipState}\n只可参考这一段关系内的上下文：${input.context}\n\n仅返回 JSON：{"title":"可选标题","body":"日记正文","emotionalState":"完整的情绪短句","weather":"","location":"","tags":["日常"]}。日记必须自然、第一人称、有角色自己的生活与想法；不要复述聊天，不要提及 prompt、memory、relationId、系统或模型；不要写括号动作、分析报告、伪图片或伪语音，也不要泄露用户未公开的私密信息。`;
};
