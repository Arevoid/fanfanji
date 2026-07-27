const EXPLICIT_IMAGE_REQUEST = /(?:给我|给咱|发我|发张|发一张|看看|生成|拍).{0,16}(?:照片|图片|图像|自拍|相片)|(?:照片|图片|图像|自拍|相片).{0,12}(?:给我|发我|看看|生成)/i;
const NEGATED_OR_QUOTED = /(?:不要|别|无需|不用|禁止|不想|别再).{0,10}(?:照片|图片|图像|自拍|相片)|(?:“|"|《).{0,30}(?:发张照片|生成一张|给我看看图片)/;

/** Conservative by design: uncertainty never spends image quota. */
export function isExplicitImageRequest(text: string): boolean {
  const normalized = text.trim();
  return normalized.length > 0 && !NEGATED_OR_QUOTED.test(normalized) && EXPLICIT_IMAGE_REQUEST.test(normalized);
}

export function assertImageGenerationTrigger(trigger: "manual" | "explicit-user-text", userText?: string): void {
  if (trigger === "manual") return;
  if (trigger === "explicit-user-text" && isExplicitImageRequest(userText || "")) return;
  throw new Error("图片生成已拦截：只有明确的用户图片请求或手动确认可以调用图片 API。");
}
