/** Explicit synthetic assessment for provenance/transition fixtures whose
 * meaningful value is an input, rather than the behavior under test. */
export const meaningfulMemoryValue = (quote: string) => ({ quote, impact: 1, durability: 1, novelty: 1, confidence: .95,
  reason: "专项测试中的持续信息或共同经历；本评估为模拟输入，不代表真实模型验收" });
